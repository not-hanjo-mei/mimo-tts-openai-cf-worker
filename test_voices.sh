#!/bin/bash

# 检查命令行参数
if [ $# -lt 1 ]; then
    echo "使用方法: $0 <WORKER_URL> [API_KEY]"
    echo "示例: $0 https://mimo-tts-worker.example.com api_key_123"
    exit 1
fi

# 从命令行参数获取配置
WORKER_URL="$1"
API_KEY="${2:-}"  # 如果没有提供第二个参数，API_KEY 将为空

# 验证 WORKER_URL
if [[ ! "$WORKER_URL" =~ ^https?:// ]]; then
    echo "错误: WORKER_URL 必须以 http:// 或 https:// 开头"
    exit 1
fi

# 创建输出目录（使用绝对路径）
OUTPUT_DIR="$(pwd)/test/voice_test_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

# 要测试的 MiMo v2.5 语音列表（中文和英文）
VOICES=(
    "mimo_default"
    "冰糖"
    "茉莉"
    "苏打"
    "白桦"
    "Mia"
    "Chloe"
    "Milo"
    "Dean"
)

# 测试文本（中文语音用中文，英文语音用英文）
CHINESE_TEXT="你好世界"
ENGLISH_TEXT="Hello World"

# 检查WAV文件是否有效
check_wav() {
    local file="$1"
    # 检查文件大小是否大于44字节（最小WAV头大小）
    if [ ! -s "$file" ]; then
        echo "文件大小为0" >&2
        return 1
    fi
    local filesize
    filesize=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
    if [ "$filesize" -le 44 ]; then
        echo "文件大小 ($filesize 字节) 小于最小WAV头 (44 字节)" >&2
        return 1
    fi
    # 检查 WAV 头部魔术字节: "RIFF" 在偏移0处, "WAVE" 在偏移8处
    if ! xxd -l 4 "$file" | grep -q "RIFF"; then
        echo "不是有效的 WAV 文件 — 缺少 RIFF 头" >&2
        xxd -l 16 "$file" >&2
        return 1
    fi
    if ! xxd -s 8 -l 4 "$file" | grep -q "WAVE"; then
        echo "不是有效的 WAV 文件 — 缺少 WAVE 标识" >&2
        xxd -l 16 "$file" >&2
        return 1
    fi
    return 0
}

echo "开始测试 MiMo v2.5 语音..."
echo "输出目录: $OUTPUT_DIR"
echo "----------------------------------------"

# 构建curl命令的headers
HEADERS=(-H "Content-Type: application/json")
if [ -n "$API_KEY" ]; then
    HEADERS+=(-H "Authorization: Bearer $API_KEY")
fi

# 创建测试结果日志
RESULT_LOG="$OUTPUT_DIR/test_results.txt"
echo "MiMo v2.5 语音测试结果 - $(date '+%Y年 %m月 %d日 %A %H:%M:%S %Z')" > "$RESULT_LOG"
echo "----------------------------------------" >> "$RESULT_LOG"

# 成功计数器
success_count=0
total_count=${#VOICES[@]}

for voice in "${VOICES[@]}"; do
    echo "测试语音: $voice"
    echo "测试语音: $voice" >> "$RESULT_LOG"

    # 根据语音选择合适的测试文本
    text="$CHINESE_TEXT"  # 默认使用中文
    if [ "$voice" = "Mia" ] || [ "$voice" = "Chloe" ] || [ "$voice" = "Milo" ] || [ "$voice" = "Dean" ]; then
        text="$ENGLISH_TEXT"  # 英文语音
    fi

    output_file="$OUTPUT_DIR/test_${voice}.wav"

    # 发送请求并保存响应
    response=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL" \
        "${HEADERS[@]}" \
        -d "{
            \"model\": \"gpt-4o-mini-tts\",
            \"input\": \"$text\",
            \"voice\": \"$voice\",
            \"response_format\": \"wav\",
            \"speed\": 1.0
        }" -o "$output_file")

    # 获取 HTTP 状态码
    http_code=$(echo "$response" | tail -n1)

    # 检查结果
    if [ "$http_code" = "200" ]; then
        if check_wav "$output_file"; then
            echo "✅ 成功 - 已保存到 $output_file"
            echo "✅ 成功" >> "$RESULT_LOG"
            ((success_count++))
        else
            error_msg=$(check_wav "$output_file" 2>&1)
            echo "❌ 失败 - 文件验证失败: $error_msg"
            echo "❌ 失败 - 文件验证失败: $error_msg" >> "$RESULT_LOG"
            # 创建 errors 子目录
            mkdir -p "$OUTPUT_DIR/errors"
            # 移动到 errors 目录，保持原始文件名
            mv "$output_file" "$OUTPUT_DIR/errors/$(basename "$output_file")"
            echo "已保存错误响应到: $OUTPUT_DIR/errors/$(basename "$output_file")"
        fi
    else
        echo "❌ 失败 (HTTP $http_code)"
        echo "❌ 失败 (HTTP $http_code)" >> "$RESULT_LOG"
        # 创建 errors 子目录并保存错误响应
        mkdir -p "$OUTPUT_DIR/errors"
        mv "$output_file" "$OUTPUT_DIR/errors/$(basename "$output_file")" 2>/dev/null
        echo "已保存错误响应到: $OUTPUT_DIR/errors/$(basename "$output_file")"
    fi
    echo "----------------------------------------" | tee -a "$RESULT_LOG"
done

# 输出测试总结
echo -e "\n测试完成！"
echo -e "\n测试总结：" >> "$RESULT_LOG"
echo "总计测试: $total_count" | tee -a "$RESULT_LOG"
echo "成功数量: $success_count" | tee -a "$RESULT_LOG"
echo "失败数量: $((total_count - success_count))" | tee -a "$RESULT_LOG"
echo "成功率: $((success_count * 100 / total_count))%" | tee -a "$RESULT_LOG"

# 列出成功生成的文件
echo -e "\n成功生成的语音文件："
ls -lh "$OUTPUT_DIR"/*.wav 2>/dev/null

# 如果全部失败，给出提示
if [ $success_count -eq 0 ]; then
    echo -e "\n⚠️  警告：所有测试都失败了！"
    echo "请检查："
    echo "1. Worker URL 是否正确"
    echo "2. API Key 是否正确（如果需要）"
    echo "3. 网络连接是否正常"
fi
