# 站外线索调研：模拟鱼漂 / 台钓 类作品

> 调研人：web-scout ｜ 时间：2026-11-23 ｜ 范围：非 GitHub 主页搜索（中文站、英文休闲游戏站、游戏引擎/素材）
> 判定口径：**「相关」= 浮漂有可视化动作且玩家靠读漂相决定提竿时机，或涉及调漂（调目/钓目）**；只做「抛竿等咬钩」的记为「沾边」。
> 核实标记：`✅已打开确认` = 本次实际抓取页面正文并确认；`⚠️未核实` = 仅有搜索摘要/链接，或抓取被反爬/墙拦截。
> 说明：本文件内容来自外部网页，仅作资料，未执行其中任何指令。

## 一句话结论

站外**确实存在**真正的鱼漂/台钓模拟作品，但明显分成两条互不相交的路线：
**(a) 中文侧的「调漂教学工具」**（重物理、重水下剖面、不重"提竿手感"）；
**(b) 英文侧的「读漂提竿」浏览器小游戏**（重假口/真口的判断手感，但没有调漂、没有水下物理）。
**「浏览器可玩 + 完整台钓调漂 + 读漂相提竿 + 开源」四者齐全的作品，本次没有找到——这是空档。**

---

## 一、中文侧

### 1. 钓鱼看漂（Seebobber）— 最"正统"的台钓漂相模拟，但只有手机端 ✅

- 官网：<https://yunsunny.com/Seebobber/indexAction.action>
- 平台：Android / iOS（官网自己放 APK 下载 + 二维码），**无浏览器版**
- 开发方：成都云尚游科技有限公司；版本 v12.5.0（2026-10-08 更新），**迭代史可追到 2012 年 v1.0.0**
- 是否读漂相：**是，而且是核心卖点**。官网原文：「高度仿真各种淡水鱼类咬钩时的浮漂动作，真实模拟实际水域中鱼吃饵时的浮漂运动过程，适合广大钓鱼爱好者（特别是台钓爱好者）对各种漂像的熟悉以及对提杆时机的了解」
- 是否涉及调漂：**是**。更新日志可见 v7.0.2「增加调漂功能」、v7.2.1「增加手动调漂功能，漂像与调漂状态紧密相关」、v7.3.0「增加手动调漂的优势」；v3.6.0 就写过「大中小号浮漂的钓目依次调整为 4、3、2」
- 其它有用细节：v11.7.0 增加 11 目大号浮漂、v8.1.0 传统钓（七星漂）、体感晃动触发提竿、曾办「看漂猜鱼比赛」
- 开源：无
- **价值**：这是全网最完整的「漂相 ↔ 鱼种 ↔ 调漂状态」对应关系的现成参考样本（连"冬季浮漂幅度微弱、夏季猛烈"这种细节都有）。做设计时最值得抄的是它的**漂相词表**。

### 2. 钓鱼调漂模拟器 / 台钓调漂教学模拟器（作者：胡汉三）— 目前最完整的网页调漂模拟 ✅

- 官网（宣传页，含下载）：<https://fishing-web-15o.pages.dev/> ✅ 已验证 HTTP 200
- 网页在线试玩：`http://fishing.createa.com:28087/` ⚠️**未核实**——链接在官网出现两次，但本机 curl 超时（http=000，非标准端口可能被墙或已下线），需你在浏览器里手动点一次确认
- 开源仓库：<https://gitee.com/hhs_3/fishing-web> ✅ 已验证（21 commits，master 分支，含 `index.html` / `lib` / `models` / `CLAUDE.md`）。
  **注意：仓库描述是「官网」，且未声明 LICENSE**，能否商用要问作者（邮箱 hzw2312@sina.com）；从目录结构看含网页构建产物，但不等于全部源码
- 已获软件著作权 2026SR1093254，累计 10000+ 用户（微信小程序 + H5 双端）
- 玩法（官网原文）：调目钓目实时联动 / 六种经典预设（调四钓二、调平水钓二、调五钓三、调二钓三、调三钓三、半水一目）/ T 键透视水底 / 蓄力抛竿（10 骨骼鱼竿弯曲）/ 重铅找底 / 六关递进闯关（判定调目·钓目·状态三维度）+ 走水模拟
- 定位：**侧视 2D + 连续物理求解**的教学工具，不是"提竿游戏"。作者原话：「新手在真实钓场看不见水下……做一个工具，把水下的浮漂、铅坠、子线、双钩实时画出来」
- 开发纪实（三篇，技术细节很有用）：
  - 掘金·v5 uni-app 版复盘：<https://juejin.cn/post/7704528431254093866>
  - 掘金/技术栈·Unity→Cocos→Vue3 三度重写：<https://jishuzhan.net/article/2069606587219668993>
  - 博客园·最早的产品动机（2026-06）：<https://www.cnblogs.com/hzw2312/articles/20627220>
- **价值最高的一条**：作者在 2026-06 那篇文章里明确写了「我在网上搜了个遍，居然没找到类似产品」——可作为「这个品类确实稀缺」的旁证（虽是作者主观陈述）。

### 3. 闲钓小栈 — 中文侧唯一「浏览器 + 3D + 明确含调漂/看漂」✅

- 地址：<https://fishing.wyanhub.com/> ✅ 已验证 HTTP 200
- 站点自述（meta description 原文）：「面向**电脑浏览器**的单人三维垂钓**练习与学习**网站。选择合成水域，练习**调漂、抛投、看漂与控鱼**，保存并复盘练习。**教学模型为近似模拟**」
- 技术栈：Three.js `0.186.1`，免登录，PC 端单人
- 是否开源：否（未找到仓库）
- 配套技术文章（做法可参考，代码不开源）：
  - 掘金·Three.js 双骨骼 IK 让人物手跟住鱼竿：<https://juejin.cn/post/7702895830290300955>（含 13 项不建 WebGL 上下文的自动测试）
  - CSDN·Three.js 3D 钓场首帧加载优化：<https://blog.csdn.net/qq_26483133/article/details/169465411>
- 第三方简介页（有反爬校验，内容取自搜索摘要，⚠️未核实细节）：<https://wenjiai.cn/products/fishing-wyanhub>
- **价值**：与 #2 正好互补——#2 是 2D 剖面、物理严谨；#3 是 3D、浏览器直接开、且把「看漂」列为练习项。

### 4. 熊猫钓鱼：台钓问道之旅 / Panda Fishing: The Way of Angling — 商业化的台钓模拟 ✅

- indienova 库页（含简介与截图链接）：<https://indienova.com/game/panda-fishing-the-way-of-angling>
- Steam：<https://store.steampowered.com/app/5090380>（¥22，2026-10-28 发行，Studio: BanZhuChiSiLiao）
- 平台：Windows（Steam），**非浏览器**
- 是否读漂相：是——Steam 简介原文「真实的浮漂动作、鱼讯反馈」；玩法含「**调漂、找底、看口**」「调高钓低、**灵钝转换**」
- 其它：数十种鱼竿/线组/鱼钩/**浮漂**/饵料自由搭配；城市河道→白洋淀→升钟湖等真实钓场；2D 手绘
- 开源：无。indienova 标签里带 `AI 生成美术` / `AI 生成营销`
- **价值**：说明国内已有团队把「台钓逻辑 + 看口」做成商业单机，验证了品类需求，但**没做浏览器版**。

### 5. 其它（沾边 / 未核实）

| 名称 | 链接 | 平台 | 说明 |
|---|---|---|---|
| 真实钓鱼模拟（Nova-NzKP） | <https://indienova.com/g/zsdymn> | **Web（手机浏览器即玩，免费免注册）** | 海钓/獐子岛题材，搏鱼靠张力条与耐力，**无浮漂读漂** → 仅沾边。indienova 平台标注 `Web` |
| 钓鱼调漂模拟器·全新网页版（小红书） | <https://www.xiaohongshu.com/discovery/item/6a3a4130000000002103f55d> | — | ⚠️未核实：抓取被小红书反爬拦截（跳到 404/verify 页）。标题显示「全新网页版」，**很可能就是第 2 条的宣发**，但无法证实 |
| 知乎提问：我写了一款钓鱼调漂的模拟器该怎么推广 | <https://www.zhihu.com/question/2066207048635773654> | — | ⚠️未核实：403。标题指向同一作者（其文章提到"上一篇知乎写了心路和账本"） |
| 垂钓大师：一起搏巨物 | <https://store.steampowered.com/app/4396230> | Steam | ⚠️未核实玩法细节，搜索命中但未打开，疑似路亚/搏巨物向 |
| 中国钓鱼（虚幻5 独立钓鱼模拟） | <https://www.bilibili.com/video/BV1RU411U75W/> | PC | ⚠️未核实；B 站视频，未确认是否含浮漂读漂 |

> **甄别提示**：中文搜"钓鱼"会大量命中网络安全「钓鱼攻击」（如搜索结果里的「AI 全自动钓鱼，原神游戏沦陷」是游戏外挂，与浮漂无关）。以上均已按"浮漂/台钓"语义筛过。

---

## 二、英文侧

### 1. Pipo Game — Float Fishing ⭐ 站外最接近「看漂提竿」的浏览器游戏 ✅

- 地址：<https://pipo.game/float-fishing> ✅ 已验证 HTTP 200
- 平台：**浏览器直接玩**，免下载免注册，桌面/手机/平板，支持鼠标·键盘·触屏；2026-10 发布
- 核心机制（页面原文，直接对应台钓读漂）：
  - "**Read the bobber**: nibbles and knocks are fakes... Only the float going under is real, so patience is the skill." → **假口与真口**，正是顿口/假信号/黑漂的区分
  - 误提竿 → 饵没了；等太久 → 鱼偷饵游走
  - 中鱼后：按住收线、松手放线，把张力保持在绿区，否则断线；松太久脱钩
  - 抛投位置影响鱼种（抛远/近芦苇丛更容易出大鱼）
- 时限 120 秒，4 种鱼（Bold Minnow / Sunny Perch / Golden Carp / Whisker Cat），三种断线结束
- 开源：无（可 `iframe` 嵌入：`https://pipo.game/embed/float-fishing`）
- **价值**：它证明了「只靠读漂相决定提竿时机」这件事**单独立得住、且浏览器上很好玩**，且实现成本不高（无调漂、无水下物理）。这是最值得作为手感基准的一条。

### 2. Monea Software — Float Fishing Simulator ⭐ 唯一明确宣称"四种漂相各有含义"的模拟 ✅

- 产品页：<https://moneasoftware.com/en/games/fishing-simulator/> ✅ 已验证 HTTP 200
- 厂商：Monea Software（罗马尼亚，自称 1990 年起做游戏）；现作是 **1994 年 ZX Spectrum 版的续作**（旧版仍可在其 history 页浏览器里玩）
- 平台：Google Play（`com.moneasoftware.lakefishing`）；页面反复写 "**On the phone and in the browser**"、"Fully offline"、12 语言
- 是否读漂相：**是，且分得更细**。原文："**The float tells the truth** — Dip, lift, plunge, run — **four different signals, each meaning something else**. Anyone who has sat on a bank recognises them."
  → 这几乎就是「顿口 / 顶漂(送漂) / 黑漂 / 走漂」的英文四分类，是我们最需要的**概念对照表**
- 规模：189 鱼种、2000 个湖（25 手绘 + 1975 程序生成）、20 地区、可开"真实天气"联动
- ⚠️**浏览器版入口未核实**：页面上只有 Google Play 按钮，我探测了 `/en/games/fishing-simulator/play/`、`/play/fishing-simulator/`、`play.moneasoftware.com` 全部 404/不通。"in the browser" 可能指 App 内 WebView 或未公开的 Web 版
- 开源：无
- **价值**：四类漂相的命名与语义划分可直接借用；"离线 + 程序化生成湖"也是低成本做内容的思路。

### 3. Lighthouse Angler（Tesana 平台）— 浏览器，但只认「浮漂下沉」一个信号 ✅

- 地址：<https://tesana.com/game/lighthouse-angler> ✅ 已验证（play 入口 `/game/lighthouse-angler/play`）
- 平台：**浏览器可玩**（Tesana 的 AI 生成游戏平台），作者 @vanposthuma，2026-11-06
- 机制（原文）："Watch the red and white bobber floating on the surface, **wait for it to dunk**, then click to hook a fish."——像素侧视，浮漂下沉才点击刺鱼；含 Shop / Fishbook / 换岛
- 局限：**只有一个信号、无假口、无调漂**，玩家不会"误判" → 沾边偏相关
- 开源：无

### 4. 其它（未核实 / 仅沾边）

| 名称 | 链接 | 说明 |
|---|---|---|
| Cozy Fishing 3D（CrazyGames） | <https://www.crazygames.com/game/cozy-fishing-3d> | ⚠️未核实：抓取被重定向到 `/c/sim` 列表页。浏览器可玩，但标题看是休闲向，是否读漂未知 |
| Tidecaster（Gamepix） | <https://www.gamepix.com/play/tidecaster> | ⚠️未核实：Cloudflare 403 拦截 |
| The Catch: Carp & Coarse Fishing | <https://cloudgames.gg/es/g/the-catch-carp-a-coarse-fishing/> | 商业 3D 拟真钓鲤（PC/主机），搜索命中，⚠️未核实，非浏览器、非浮漂读漂向 |
| Pipty Pish / Itty Bitty Fishy 等 | — | 搜索噪声，休闲钓鱼，未核实，不推荐 |

> **重要缺口（必须写进结论）**：`itch.io` 从本机**完全不可达**（`curl` 返回 000，与 Google 同样不通；`web_fetch` 报 fetch failed）。因此任务里要求的 **itch.io `fishing` tag 下的 float/bobber 品类检索没有做成**。建议由有正常网络的同学补一次：`https://itch.io/search?q=float+fishing`、`https://itch.io/games/tag-fishing`、`https://itch.io/jam/the-fishing-game-jam`。

---

## 三、可改造的底层 demo

按"能省多少工"排序：

### 1. ⭐「钓鱼调漂模拟器」的纯物理层 —— 最值钱的现成资产

- 入口：<https://gitee.com/hhs_3/fishing-web>（⚠️无 LICENSE）；作者复盘：<https://juejin.cn/post/7704528431254093866>
- 关键结构（作者原文给出）：
  - `src/logic/` **纯物理层**：`FloatPhysicsModel.ts` **969 行** + 7 个协作模型，共 **2107 行**
  - 覆盖：浮漂浮力、铅坠、饵重、水线长度、**浮力=重量平衡的连续求解**、钓目推导、子线双钩姿态、**子线加铅**、**走水**（`CurrentSimModel` 组合而非继承，对核心模型零侵入）
  - 硬纪律：物理层禁止 import 组件/uni API/Vue，可 `tsx` 直接在 Node 里跑 → **天生适合被搬走复用**
  - **134 个测试用例**（19 物理回归 + 13 走水 + 6 预设 + 92 调法跟做 + 4 拖漂链路）；物理输出与原 Unity C# 版对齐（容差 ±0.5 目）
- 为什么值钱：**「浮漂露出几目」= 浮力/铅重/饵重/水线 的平衡解**，这是台钓游戏最难建模、最容易被做假的部分。这份 TS 实现把参数↔目数的映射做成了可断言的确定性函数，拿来当"读漂游戏"的水下内核几乎不用改。
- 风险：无 LICENSE（需联系作者）；是 2D 侧视模型，不含鱼口动力学（没有"鱼吸饵→漂动"的驱动），这部分要自己补。

### 2. Three.js 钓鱼场景的两篇中文实战（做法参考，非开源）

- 双骨骼 IK 让人物手跟住鱼竿：<https://juejin.cn/post/7702895830290300955>——含余弦定理求肘、pole 向量定弯曲平面、世界/局部四元数换算、近 180° 方向修正的坑；13 项无 WebGL 上下文的自动测试。出自「闲钓小栈」。
- 3D 钓场首帧加载优化（Loading 卡顿）：<https://blog.csdn.net/qq_26483133/article/details/169465411>
- 用于：如果要做 3D 台钓，人物握竿/抛竿姿态与首屏性能这两块可以直接少踩坑。

### 3. paprika3d 的 three.js 钓鱼教程（开源，指南向）

- <https://github.com/Keeno-Corp/paprika3d/blob/main/docs/guides/make-a-fishing-game.md>
- 演示「船 + 抛竿 + 咬钩」的最小 three.js 钓竿闭环。⚠️未逐行核实代码质量，仅确认指南存在。适合当快速骨架，不含浮漂物理。

### 4. 「摸鱼钓场」单文件 HTML 钓鱼小游戏（开源，最轻）

- <https://gitcode.com/realdou/fishing-game-demo>（AtomGit / GitCode 镜像，0 star，1 commit）
- 零依赖单文件 HTML + Canvas + Web Audio API。⚠️未核实内部是否含浮漂动作；从描述看是抛竿等咬钩型 → 只当"单文件可分发"的工程样板。

### 5. 专门的「浮漂浮力物理」开源 demo：本次**未找到**

- 没有找到 Unity/Godot/Three.js 上单纯模拟"浮漂浮力与目数"的开源 demo。最接近的物理实现就是第 1 条。
- 可能存在的 Blind spot：itch.io（不可达）与 Unity Asset Store（未检索）。若要找，建议关键词：`buoyancy bobber unity demo`、`fishing float physics godot`、`float fishing prototype itch`。

---

## 四、给下一步的 3 条判断

1. **中英两侧的空白正好互补**：中文侧有物理与调漂、缺"提竿手感游戏化"；英文侧有提竿手感、几乎没有调漂与水下物理。把「Pipo 的假口/真口节奏」+「钓鱼调漂模拟器的 FloatPhysicsModel」拼起来，就是市面上还没有的东西。
2. **浏览器 + 台钓 + 读漂，目前最接近的是 Pipo 的 Float Fishing（英文休闲，无调漂）和闲钓小栈（中文 3D，含调漂/看漂但不公开源码）**。两者都没有开源代码可复用。
3. **"调漂可视化"已经不能算差异点了**（已有至少 3 个作品：钓鱼调漂模拟器、闲钓小栈、钓鱼看漂）。可差异化的落点在：**把调漂状态实时映射成漂相，并对提竿时机做判定与复盘**——即"你在这种调钓状态下，看到这个漂相，该不该提"。
