#!/usr/bin/env python3
"""把 three.js（ESM）+ OrbitControls + app.js 打成一个「双击即可打开」的单文件 HTML。

three.module.js 结尾只有一条 export { ... }，把它改写成 window.THREE = { ... } 就变成经典脚本；
OrbitControls 的 import/export 同样改写；逐模块 gzip+base64 内嵌，boot 解压后顺序执行。
不需要本地服务器，file:// 可离线打开；最低解压 API 及兼容降级见 render_html 和 boot.js。
"""
import base64
import gzip
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"
SRC = ROOT / "src"


def three_to_classic(src: str) -> str:
    idx = src.rindex("export {")
    body = src[:idx]
    tail = src[idx + len("export {"):].strip()
    assert tail.endswith("};"), tail[-20:]
    names = tail[:-2].strip()
    entries = []
    for part in names.split(","):
        part = part.strip()
        if not part:
            continue
        if " as " in part:
            a, b = [x.strip() for x in part.split(" as ")]
            entries.append(f"{b}: {a}")
        else:
            entries.append(f"{part}: {part}")
    # 包进 IIFE：class/const 在经典脚本里属于共享的全局词法作用域，
    # 不隔离的话会和 OrbitControls 里的同名解构冲突
    return "(function(){\n" + body + "\nwindow.THREE = {" + ",".join(entries) + "};\n})();\n"


def orbit_to_classic(src: str) -> str:
    m = re.search(r"import\s*\{(.*?)\}\s*from\s*['\"]three['\"];", src, re.S)
    if not m:
        raise SystemExit("OrbitControls: import 语句未找到")
    src = src[: m.start()] + "const {" + m.group(1) + "} = window.THREE;" + src[m.end():]
    src = src.replace("export { OrbitControls };", "window.OrbitControls = OrbitControls;")
    return "(function(){\n" + src + "\n})();\n"


def guard(js: str) -> str:
    # 防止脚本里出现 </script> 提前闭合
    return js.replace("</script", "<\\/script")


APP_MODULES = (
    "physics.js", "tackle.js", "fish-body.js", "fish-collision.js",
    "terrain-cache.js", "tank-floor.js", "fish-behavior.js", "fish-lab.js", "crucian-mesh.js", "fish-view.js",
    "fish-panel.js", "optics.js", "seat-workshop.js", "float-scope.js", "performance.js", "app.js",
)


def make_manifest(root=ROOT):
    """Build in memory only; gzip members are independent and reproducible.

    No model/source mutation and no fetch/import/CDN is needed at runtime.
    app.js MUST stay last: its readiness Promise is consumed by boot.js.
    """
    modules = [
        ("vendor/three.module.js", three_to_classic((root / "vendor/three.module.js").read_text(encoding="utf-8"))),
        ("vendor/OrbitControls.js", orbit_to_classic((root / "vendor/OrbitControls.js").read_text(encoding="utf-8"))),
    ]
    modules.extend(("src/" + name, (root / "src" / name).read_text(encoding="utf-8"))
                   for name in APP_MODULES)
    packed = []
    for name, source in modules:
        raw = source.encode("utf-8")
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        packed.append({"name": name, "encoding": "gzip-base64",
                       "sourceBytes": len(raw), "compressedBytes": len(compressed),
                       "data": base64.b64encode(compressed).decode("ascii")})
    return {"version": 1, "modules": packed}


def render_html(root=ROOT):
    """Return a self-contained HTML string, without writing index.html.

    Minimum loader APIs: Promise/async functions, Uint8Array, atob, Blob,
    Blob.stream, DecompressionStream('gzip'), Response.text, inline classic JS.
    There is deliberately no online polyfill or uncompressed second payload:
    unsupported gzip engines get an actionable error + full-page retry.
    The vendored Three r170 renderer additionally requires WebGL2 (not WebGL1).
    """
    shell = (root / "src/shell.html").read_text(encoding="utf-8")
    boot = guard((root / "src/boot.js").read_text(encoding="utf-8"))
    manifest = json.dumps(make_manifest(root), ensure_ascii=True, separators=(",", ":"))
    for marker in ("/*__BOOT__*/", "/*__MODULES__*/"):
        if shell.count(marker) != 1:
            raise ValueError("shell requires exactly one " + marker)
    return shell.replace("/*__BOOT__*/", boot).replace("/*__MODULES__*/", manifest)


def main():
    # Never ship a height field baked from a different geometry/algorithm/vendor.
    subprocess.run(["node", str(ROOT / "tools/bake-terrain.cjs"), "--check"], cwd=ROOT, check=True)
    html = render_html()
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"built {out}  ({len(html.encode('utf-8'))/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
