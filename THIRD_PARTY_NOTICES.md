# 第三方资源与许可说明 / Third-party notices

本项目自身代码以 [MIT](LICENSE) 许可发布。仓库中另含以下第三方资源，它们分别适用各自的许可条款：

## 1. three.js 与 OrbitControls

- 文件：`vendor/three.module.js`、`vendor/OrbitControls.js`
- 来源：<https://github.com/mrdoob/three.js>
- 许可：MIT
- 版权：Copyright © 2010-2024 Three.js Authors（完整声明保留在 `vendor/three.module.js` 文件头）

Three.js MIT 许可文本：

```text
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 2. 银鲫摄影扫描模型（crucian scan）

- 文件：`assets/crucian-scan/`、`src/crucian-mesh.js`、`src/fish-body.js` 中的网格与纹理数据
- 原作品：**CC0 ギンブナ 🐟 Crucian Carp, *Carassius auratus langsdorfii***，作者 **ffish.asia / floraZia.com**
- 原作品页面：<https://sketchfab.com/3d-models/cc0-crucian-carp-c-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b>
- 作者页面：<https://sketchfab.com/ffishAsia-and-floraZia>
- 许可：原作页面当前声明 **CC0 1.0**；本项目下载的历史 GLB 元数据含 **CC BY 4.0**，因此按更保守的 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 保留署名与修改说明。
- 本项目对模型的修改（清理、减面、重投影贴图、标定真实口缘、构建碰撞包络等）详见 [assets/crucian-scan/LICENSE.md](assets/crucian-scan/LICENSE.md) 与 [assets/crucian-scan/README.md](assets/crucian-scan/README.md)。

## 3. 文档与截图

- `*.md` 文档、`docs/screenshots/` 截图、`preview-*.png`、`qa-*.log/json` 等实验记录由本项目产出，随代码以 MIT 许可提供；其中的第三方模型截图同时受上述模型许可约束。
- `research/` 下的调研资料引用了第三方项目的公开信息，仅作研究记录，相关权利归原项目所有。
