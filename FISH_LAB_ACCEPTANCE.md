# 鱼类行为与真实漂相实验室：扫描鲫鱼与整鱼接触验收

记录日期：2026-11-25。范围为现有玻璃缸实验室；**未开发正式室外钓场**。本页依据已落盘的模型、独立 QA、Node 日志与 Chrome 回归记录整理，不把画面真实感等同于实鱼力学标定。

## 1. 交付入口与最终机器值

- [离线单文件网页](<index.html>)：用支持 WebGL2 及 gzip DecompressionStream 的现代浏览器本地打开；模型、原摄影纹理与运行依赖内嵌，不依靠运行时下载。
- [中文操作指南](<FISH_LAB_GUIDE.md>)、[物理说明](<PHYSICS.md>)及[先行开发方案](<FISH_LAB_PLAN.md>)：实验步骤、受力路径、参数对照和适用边界。
- **最终发布的网页字节数、网页 SHA256、浏览器检查总数及各组结果，以[最终机器摘要](<qa-fish-final-summary.json>)与其指向的最后一轮原始记录为准。** 本文不固定这些随重新打包、交互增补而变化的数值。

观漂小窗双击放大已在最终重建后完成桌面及移动视口回归，含真实鼠标双击、Chrome 触摸双击模拟、按钮、Esc、横竖屏适配和只读物理验证。共十组浏览器记录均为最终版本。后续未验证的修改不能沿用本次验收；最终数值与 HTML 校验值见机器摘要。

## 2. 当前模型：实物摄影扫描，不是 Tripo

当前[运行网格](<src/crucian-mesh.js>)采用 **ffish.asia / floraZia.com** 的银鲫 *Carassius auratus langsdorfii* 实物摄影扫描，不是 Tripo 生成，也不是旧版程序鱼。约 18 cm 长，**19,900 个三角面、59,700 个非索引 GPU 顶点**；9,963 个独立几何顶点与 GPU 顶点数的口径不同。

保留原扫描的口部、双侧体形及全部鱼鳍，移除色卡与 18 个孤立单三角碎片，再减面、定向和缩放。1024×1024 RGBA 纹理由**原摄影颜色高模重投影烘焙**而来，不是重新绘制鱼鳞或生成一张替代纹理。[原摄影纹理](<assets/crucian-scan/original-scanned-albedo.png>)、[运行纹理](<assets/crucian-scan/scanned-albedo.png>)、[原生 Blender 模型](<assets/crucian-scan/silver-crucian.blend>)与[自包含 GLB](<assets/crucian-scan/silver-crucian.glb>)均保留供核查。

模型冻结标识如下，**这是网格/摄影纹理与碰撞资产关联的 modelHash，不是网页文件 SHA256**：

```text
281aa1fb3da062e2a01135377b56549b0af147fefe61975582b607777060fb67
```

来源与许可采用保守处理：

- 作者：**ffish.asia / floraZia.com**；[原作页面](<https://sketchfab.com/3d-models/cc0-crucian-carp-c-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b>)、[下载原始 GLB](<assets/candidates/research-ffish-ccd31440/model.glb>)。
- [许可与修改告知](<assets/crucian-scan/LICENSE.md>)提供署名及完整条款入口。[下载来源记录](<assets/candidates/research-ffish-ccd31440/download-manifest.json>)同时保留当前页面 CC0 信息及下载 GLB 内的历史 CC BY 4.0 声明；[来源页面元数据](<assets/candidates/research-ffish-ccd31440/sketchfab-metadata.json>)可交叉核查。当前页面许可与历史下载元数据不同，不应混为同一版本的声明。
- 本交付按 **[CC BY 4.0](<https://creativecommons.org/licenses/by/4.0/>)保守保留作者、原作链接与修改说明**，不抹除历史署名要求。[模型说明](<assets/crucian-scan/README.md>)记录清理、减面、纹理处理、坐标与许可差异。

## 3. 真实口缘、同姿态物理与整鱼接触

### 3.1 嘴不是外加标记

局部嘴原点取自扫描张口周围 **16 个真实口缘顶点**的质心；[模型摘要](<assets/crucian-scan/model-summary.json>)记录其实际索引。独立几何 QA 测得导出口缘质心舍入误差约 8.84 nm。[鱼视图](<src/fish-view.js>)继续从实际 Float32 网格口缘测量，与物理嘴位置对齐，而不是移动一个虚拟标记冒充口部对齐。

[整鱼接触模块](<src/fish-collision.js>)与渲染使用同一物理快照的位置及共享无滚转 yaw/pitch 姿态。碰撞修正作用于物理位置和向内速度，渲染消费其结果；不把鱼显示模型另行抬高来掩盖穿透。

### 3.2 整鱼包络与真实砂石高度场

- [不可变鱼体资产](<src/fish-body.js>)由原扫描高模和最终渲染网格联合构建，**830 个支持点、5090 个表面采样点**，包含腹部及全部鱼鳍。
- 使用局部侧向 **连续 ±3 mm 扫掠包络**覆盖摆尾的全部相位，不只是挑选几个动画帧测试；另有 0.1 mm 构造数值外扩及 1.5 mm 接触 skin。凸包会保守跨过鱼鳍间隙及口腔等凹部，不代表精确凹面形状。
- 缸壁、水面及底面按同姿态整鱼极值约束。砂石由场景中实际渲染的 1500 粒砂石、3 块岩石三角形建立 **4 mm 栅格单元最大高程**，再扩一格弥补离散采样空隙；在鱼所在位置求局部支撑，**不把整床提高到最高石头**。
- 近底觅食通过真实俯仰寻找嘴可达净空；接触与鱼钩反作用后移除向边界内的速度。无可行解时显式报告 `collision.unresolved` 并释放含饵，不在远处伪造捕获。

这是当前水缸的保守离散整鱼接触方案，**不是完整刚体动力学、连续 CCD、洞穴或悬垂碰撞系统**。它没有完整转动惯量、接触力矩、多鱼碰撞或高速穿透的一般保证。扫描视觉网格仍保留 98 条开放／非流形缝边，不宣称水密 CAD；闭合保守碰撞包络不依赖视觉网格水密。

## 4. 行为、受力路径与旧校准

已接入巡游、发现、接近、观察、吸饵、吐饵、抬头、含饵游动、蹭线、逃离十态；有八项手动实验、自主行为、逐态参数覆盖、固定种子重置、暂停、单步、慢放、10 秒曲线和事件。

鱼只向真实钩节点输出外力，或向**张紧**子线输出接触等效力，再经钩／子线／八字环／主线约束传到浮漂。模型、行为和面板不设置漂坐标，不播放预设顿口、送漂或黑漂。松线空行程、床面承重、钩饵质量和施力方向可显著改变甚至屏蔽漂相；按钮名称不是必须出现某种漂相的验收条件。

固定物理步长仍为 1/240 s；渲染不决定物理步数。暂停与原工作台冻结不积压实验时间。相同初态、配置、种子与固定步数用于模型内复现；长墙钟停顿存在明确的积压丢弃，不应声称后台停顿也被完整模拟。

[旧线组基线备份](<baselines/pre-fish-lab.zip>)及其 [SHA256 清单](<baselines/pre-fish-manifest.json>)保留；[替换扫描鱼前备份](<baselines/pre-scan-fish.zip>)用于区分旧程序模型与本次摄影扫描。36 组旧快照比较仍覆盖三配置、四时间点、未传／空／零外力输入，对原字段做精确哈希回归；不靠放宽旧校准容差通过。**这里不再声称所有原界面或观漂模块源码逐字节未改**，界面增补必须由相应回归验证。

## 5. 已落盘验证证据

### 5.1 源资产独立 QA：三份通过

| 证据 | 验证范围与已记录结果 |
| --- | --- |
| [源扫描与连续包络几何 QA](<assets/crucian-scan/geometry-qa.json>) | `passed: true`；检查 375,838 个原导入顶点、最终网格及连续摆尾包络；69,731 个独立表面探针；记录真实口缘、拓扑边界及包络包含余量。 |
| [运行纹理与 GLB 对照 QA](<assets/crucian-scan/runtime-qa.json>) | `passed: true`；经典离线载荷、不可变碰撞数组、4,194,304 个 RGBA 字节与已保存 PNG 一致，GLB 缓冲区边界与运行几何匹配。 |
| [GLB 原生重新导入 QA](<assets/crucian-scan/glb-reimport-qa.json>) | `passed: true`；一个网格、19,900 个三角面，Blender 原生重导入，无须结构修复。其 UV 拆分顶点数不应与非索引 GPU 顶点数直接比较。 |

前两份报告的 modelHash 与本文冻结标识一致。上述检查验证资产与离散包络的一致性，不等同于对任意场景、任意速度的精确连续接触证明。

### 5.2 Node：性能版 188 项通过

[当前完整日志](<qa-performance-unit.log>)记录 188 项通过、0 项失败；原扫描阶段的 [135 项日志](<qa-scan-unit-final.log>)保留为历史证据，不冒充当前完整回归。覆盖原线组、光学、观漂相机和控制，以及行为复现、八实验、外力释放、钩重、整鱼姿态扫描、真实地形局部支撑、无解报告、源网格连续变形、加载调度、自动画质与缓存逐位比较。

主要实现对应[行为与协调器测试](<tests/fish-behavior.test.cjs>)、[耦合回归](<tests/fish-coupling.test.cjs>)、[整鱼接触测试](<tests/fish-collision.test.cjs>)及[扫描资产／实际变形顶点测试](<tests/fish-scan.test.cjs>)。最终通过数及网页 SHA 以[机器摘要](<qa-fish-final-summary.json>)所指最后一轮日志为准。

### 5.3 Chrome：已有桌面／手机模拟共十组回归，错误为零

以下是**当前扫描版本**的五类 × 两视口证据。每组的 JavaScript 错误数组为空；具体断言数读取 JSON，不在本文固定总数。

| 回归类别 | 桌面 1440×1000 | 手机模拟视口 390×844 |
| --- | --- | --- |
| 通用控件 | [JSON](<preview-performance-regression-desktop.json>) · [画面](<preview-performance-regression-desktop.png>) | [JSON](<preview-performance-regression-mobile.json>) · [画面](<preview-performance-regression-mobile.png>) |
| 指针与原工作台交互 | [JSON](<preview-performance-drag-desktop.json>) · [画面](<preview-performance-drag-desktop.png>) | [JSON](<preview-performance-drag-mobile.json>) · [画面](<preview-performance-drag-mobile.png>) |
| 原场景观漂相机 | [JSON](<preview-performance-scope-desktop.json>) · [画面](<preview-performance-scope-desktop.png>) | [JSON](<preview-performance-scope-mobile.json>) · [画面](<preview-performance-scope-mobile.png>) |
| 水体与 GPU 光学采样 | [JSON](<preview-performance-water-desktop.json>) · [画面](<preview-performance-water-desktop.png>) | [JSON](<preview-performance-water-mobile.json>) · [画面](<preview-performance-water-mobile.png>) |
| 鱼实验实际操作 | [JSON](<preview-performance-fish-desktop.json>) · [画面](<preview-performance-fish-desktop.png>) | [JSON](<preview-performance-fish-mobile.json>) · [画面](<preview-performance-fish-mobile.png>) |

鱼实验回归包含实际回调、固定步暂停／单步、慢放、状态配置、真实钩重、工作台同步冻结、含饵与实际节点力、自然抬头露目变化、真实变形嘴缘、同种子历史，以及实验过程中实际变形顶点相对场景砂石、缸壁和水面的净空检查。离线检查验证了无外链脚本／样式和无网络资源请求。

**手机列是桌面 Chrome 的移动视口及触摸事件模拟，不是手机真机、Safari 或全浏览器兼容性认证。** 双击放大后的实际画面见[放大预览](<preview-scope-expanded-desktop.png>)；最终计数以最后重建后更新的[机器摘要](<qa-fish-final-summary.json>)为准。

### 5.4 模型与数值记录入口

- [扫描鱼六视图](<assets/crucian-scan/contact-sheet.png>)、[真实口缘标记特写](<assets/crucian-scan/mouth-landmarks.png>)：用于核对体形、原摄影颜色、完整鱼鳍和真实口缘；特写的头部裁切只是预览裁切，不是整鱼损坏。
- [当前数值实验记录](<qa-fish-experiments.json>)：以此及[操作指南](<FISH_LAB_GUIDE.md>)读取本模型下实际位移、作用力、释放和配置敏感性，不沿用旧程序鱼的位移表。
- [模型说明与可复现处理流程](<assets/crucian-scan/README.md>)：记录源文件、许可、处理过程和三个独立检查入口；旧程序鱼预览不作为本扫描版本的模型证据。

### 5.5 60 FPS 原则与加载体验

新增[60 FPS 性能原则及完整结果](<PERFORMANCE.md>)：保留 240 Hz / 24 次物理解算，仅自适应视觉采样。当前双视口及高像素比共九场景约 60 FPS，P95/P99 ≤16.8 ms，无 >33.5 ms 帧。单文件从 12.32 MB 缩至 5.28 MB，最长启动任务从 1402–1667 ms 降到 206–221 ms；完整就绪中位数约 1.77–1.78 秒，比暖缓存基线增加约 0.2 秒，不能宣传全面提速。[最终性能机器摘要](<qa-performance-final-summary.json>)将所有新回归绑定到同一网页 SHA，确认冻结的摄影网格与碰撞资产源码未变。

## 6. 验收边界

本阶段完成的是可离线复现的玻璃缸数值实验，不是实鱼行为或中鱼率预测。鱼仍采用默认 0.08 kg 的受驱中性浮力点质量，而非完整六自由度刚体或 CFD；局部吸流为经验高斯核，持饵为限力弹簧阻尼，没有求解真实口腔流场、鳍推水、软组织或穿刺中钩。`held` 表示模型内持饵，不表示刺中鱼。

整鱼—环境接触已经加入，但鱼体—线接触仍是张紧子线等效作用，不是完整松绳碰撞、缠绕、断线或多鱼系统。钩重改变真实重量、惯性和钢材排水，不改变可见钩形或钩号。原床面未建立完整水平摩擦，释放后可停在新的横向平衡，不应添加隐藏回位力强拉回旧坐标。更详细的近似与参数说明见[物理说明](<PHYSICS.md>)和[操作指南](<FISH_LAB_GUIDE.md>)。
