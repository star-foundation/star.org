#!/usr/bin/env bash
# =====================================================================
#  Star.org 白皮书构建
# =====================================================================
#  把 docs/whitepaper/*.tex 编译为 PDF，输出到 site/assets/whitepaper/，
#  由 build-site.mjs 的 copyAssets() 一并复制进 _site/ 对外发布。
#
#  为什么要提交 PDF：CI（GitHub Actions ubuntu-latest）不保证装了 TeX，
#  而站点构建必须能发布白皮书。因此 PDF 作为产物随仓库提交，
#  与 certificates/*.pdf、og/*.png 的处理方式一致（见 README.zh-CN 第 3 节）。
#
#  依赖：xelatex（TeX Live）+ 仓库内置的 Noto Sans/Serif SC 子集（fonts/）。
#        字体随仓库内置，本机不需要安装任何中文字体。
#
#  用法：bash docs/whitepaper/build.sh   或   npm run build:whitepaper
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"

BUILD_DIR="build"
OUT_DIR="../../site/assets/whitepaper"
LANGS=(zh en)

if ! command -v xelatex >/dev/null 2>&1; then
  echo "错误：未找到 xelatex。请先安装 TeX Live（macOS: brew install --cask mactex-no-gui）。" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR" "$OUT_DIR"

# `\claim` 与 `\takeaway` 是**命令**（\claim{...}），不是环境。
# 误写成 \begin{takeaway}...\end{takeaway} 时 LaTeX 不报错，但只把正文的
# 第一个字符当成参数吞进色块（实测：整段只剩一个 "T" 在框里）。
# 这类错误静默又难看，所以在编译前直接拦下来。
if grep -n '\\begin{takeaway}\|\\begin{claim}' ./*.tex; then
  echo "错误：\\claim 与 \\takeaway 是命令，请写成 \\takeaway{...}，不要用环境写法。" >&2
  exit 1
fi

for lang in "${LANGS[@]}"; do
  job="star-org-whitepaper-$lang"
  echo "编译 $job.tex"

  # 两遍：第一遍写 .toc/.aux，第二遍生成正确的目录与交叉引用
  for pass in 1 2; do
    log="$BUILD_DIR/$job.pass$pass.log"
    if ! xelatex -interaction=nonstopmode -halt-on-error \
        -output-directory="$BUILD_DIR" "$job.tex" >"$log" 2>&1; then
      echo "── 第 $pass 遍编译失败，末尾日志 ──" >&2
      tail -n 40 "$log" >&2
      exit 1
    fi
  done

  # 缺字会静默渲染成空白，必须显式拦截
  if grep -q "Missing character" "$BUILD_DIR/$job.pass2.log"; then
    echo "警告：$job 存在缺字，内置字体子集未覆盖下列字符：" >&2
    grep "Missing character" "$BUILD_DIR/$job.pass2.log" | sort -u | head -n 20 >&2
    exit 1
  fi

  cp "$BUILD_DIR/$job.pdf" "$OUT_DIR/$job.pdf"
  echo "  → $OUT_DIR/$job.pdf"
done

echo "完成。PDF 已就绪，执行 npm run build:site 即可发布。"
