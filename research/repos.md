# GitHub「模拟鱼漂 / 台钓」钓鱼游戏 —— 仓库实证核查

> 核查人：repo-checker（teammate）
> 核查时间：2026-11-23 17:19–17:40（Asia/Shanghai）
> 核查方式：**只读**，未 clone 任何仓库。star / 语言 / 最后更新 / license 取自 GitHub Search API（`/search/repositories`，未认证 10 次/分钟）；文件清单取自 jsDelivr Data API；源码/README 取自 jsDelivr CDN（`cdn.jsdelivr.net/gh/<owner>/<repo>@HEAD/<path>`）与 codeload 小仓库 tar.gz；少量 README 取自 raw.githubusercontent.com。
> 说明：本机 IP 的 GitHub **core API 额度已耗尽**（`/rate_limit` 显示 core 60/60 used，`/repos/*` 会 403），因此 star 等元数据全部走 search API（真实值，非估算）；后半程 `raw.githubusercontent.com` 开始超时，故改用 jsDelivr / codeload 复核源码，**字节数均来自实际下载**。

---

## 0. 一句话结论（必答）

**没有找到「专门模拟鱼漂读漂相 / 台钓调漂」的、完整可玩的独立游戏仓库。**

这个细分方向在 GitHub 上的现状是「**机制碎片化**」：
- 「浮漂 + 咬钩信号 + 提竿时间窗」作为**局部机制**在不少浏览器钓鱼游戏里都存在（有的还做了假口/试探）；
- 「调漂 / 找底 / 打窝 / 目数」只以**教学模拟器**形式单独存在（且没有鱼）；
- 把「调漂（半水调目→找底→钓目）+ 饵料雾化 + 窝子 + 顿口/送漂/黑漂读漂 + 提竿成败」串成一个游戏的仓库：**未发现**。

最接近的 3 个（详见 §3）：

| 排名 | 仓库 | 它覆盖了台钓的哪一半 | 最大的差距 |
|---|---|---|---|
| 1 | [Sp1r1tual/fishoria](#sp1r1tualfishoria) | 浮漂微顿（micro-dip）+ 提前刺鱼判定 + 咬钩超时 + 三种钓组（float/feeder/spinning）+ 打窝 | 欧式鲤鱼钓语境；没有「调目/钓目/半水找底」的调漂流程；工程需自建后端，体量大、营销味重 |
| 2 | [bridge-mind/tideline](#bridge-mindtideline) | 3D 浮漂下沉 + `!` 提示 + **1.05s** 刺鱼窗口（稀有鱼更短）+ 假口（nibble）→ 张力溜鱼 | 纯街机 3D 钓鱼；无调漂、无目数、无饵料雾化/窝子 |
| 3 | [Sumomo0222/first-person-fishing](#sumomo0222first-person-fishing) | 第一人称浮漂可视化 + **假口轻点** + 浮漂猛沉出「!」+ **1.65s** 窗口，早了空竿、晚了脱钩「鱼儿脱钩了」 | 纯前端单页小游戏（0 star，无 license）；无调漂、无饵料/窝子，鱼种与物理很浅 |

> 补充：若把「调漂」单独看，[ANT-CYJ/fishing-basic](#ant-cyjfishing-basic) 是全网最贴的「调四钓二 / 重铅找底 / 打窝」交互模拟器，但它**不是游戏**（无鱼、无咬钩、无提竿）。
> 若只为找「假口/送漂」的手感参考，[izadoesdev/bobber-run](#izadoesdevbobber-run) 的 `TEASES` / `FAKE_OUT` 设计是最接近台钓「小杂鱼试探 vs 真顿口」的代码实现。

**建议**：自研时不必指望找到可直接改的台钓开源游戏，可参考「fishoria 的浮漂微顿+提前刺鱼 + tideline 的 1 秒级窗口 + ANT-CYJ 的调漂教学模型 + bobber-run 的假口状态机」自己拼。

---

## 1. 主表：已知候选 14 个（逐个核实）

「贴合度」判据：**高** = 有浮漂可视化且漂相直接决定提竿成败，并且/或者有调漂环节；**中高/中** = 有浮漂+咬钩信号但缺调漂或提竿判定不严；**低** = 有浮漂但只是挂件，或玩法非台钓；**无关** = 没有浮漂/不是钓鱼玩法。

| # | 仓库全名 | 链接 | ⭐ | 语言 | 最后更新 | 能否在线玩 | 贴合度 | 一句话证据 |
|---|---|---|---|---|---|---|---|---|
| 1 | ava-agent/fish-agent | [repo](https://github.com/ava-agent/fish-agent) | 2 | TypeScript (Expo/RN) | 2026-07-11 | ✅ [fish.rxcloud.group](https://fish.rxcloud.group)（HTTP 200） | **中** | README：「等待 — 浮漂在水面浮动…上钩 — **浮漂剧烈晃动提示，2.5 秒内点击设钩**」；代码 `app/(tabs)/index.tsx` 有 `Bobber` 组件 + `hookTimeout … 2500` |
| 2 | bridge-mind/tideline | [repo](https://github.com/bridge-mind/tideline) | 11 | JavaScript (Three.js, 零构建) | 2026-06-10 | ✅ [bridge-mind.github.io/tideline](https://bridge-mind.github.io/tideline/)（200） | **中高** | `src/gameplay/bobber.js`(154行) 浮漂缓动下沉；`src/gameplay/biteSystem.js`(92行) nibble+窗口；`config.js` `hookWindowBase: 1.05`、`nibbleChance: 0.65` |
| 3 | Sp1r1tual/fishoria | [repo](https://github.com/Sp1r1tual/fishoria) | 4 | TypeScript (React19+PixiJS8) | 2026-05-27 | ✅ [www.fishoria.online](https://www.fishoria.online)（200） | **高**（浏览器游戏里最高） | `client/src/game/engine/entities/HookEntity.ts`(12814 B)：`rigType==='float'` 时 `sinkY = Math.max(0, pulse*14*scale)`、`isDiving`；`detection.config.ts` 有 `nibbleMultiplier`、`EARLY_HOOK`、`biteTimeout 3~7s` |
| 4 | littensy/fishing-minigame | [repo](https://github.com/littensy/fishing-minigame) | 79 | Luau (Roblox) | 2026-04-11 | ✅ Roblox 内可玩（非 HTML/JS） | **低** | 有 `src/server/gameplay/bobbers.server.luau`，但 README 玩法是「keep the fish within the control bar」= Fisch/星露谷式进度条，浮漂无漂相判定 |
| 5 | mrsperry/fishing-enterprises | [repo](https://github.com/mrsperry/fishing-enterprises) | 28 | JavaScript（jQuery 时代） | 2020-02-23 | ✅ [mrsperry.github.io/fishing-enterprises](https://mrsperry.github.io/fishing-enterprises)（200） | **无关** | `javascript/fishing.js`：只有 Cast out / Reel in + `random(1,100) <= fish.chance` 随机判定，全程无浮漂 |
| 6 | **Jason8445/fishing_web** | [repo](https://github.com/Jason8445/fishing_web) | 38 | HTML | 2026-06-11 | ❌ 无 | **⛔ 排除（网络钓鱼）** | `index.html`(9794 B) `<title>iLearn 逢甲大學</title>`，`<form id="loginForm">` 无 action，submit 只弹「登入無效，請重試」；`test/screen_login.png`、`test/moodle4_log.jpg` → **伪造高校 Moodle 登录页，38 star 是假象** |
| 7 | sharkbuster/howtofish | [repo](https://github.com/sharkbuster/howtofish) | 0 | HTML（单文件 Canvas2D） | 2026-09-17 | ✅ [sharkbuster.github.io/howtofish](https://sharkbuster.github.io/howtofish/)（200） | **中** | `index.html` 1202–1218 行：红白浮标 + 咬钩时变亮红 + 脉冲 `!`；但 `state==='bite'` **无超时判定**，可无限晚提竿，无顿口/送漂/黑漂区分；主体是打「疯鱼」 |
| 8 | izadoesdev/bobber-run | [repo](https://github.com/izadoesdev/bobber-run) | 3 | TypeScript (WebGL2+Preact) | 2026-11-09 | ❌ 未确认（无公开部署，需 `bun install && bun run dev`） | **中高（信号层）** | `src/game/fishing.ts`(40 KB)：`TEASES` 假口时序、`FAKE_OUT`「a big dip, a splash, no thump」、`strikeWindows`（perfect/any）、提示「Too early / Just a nibble / A fake-out! / It got away」 |
| 9 | redcobra1652/fishing-simulator | [repo](https://github.com/redcobra1652/fishing-simulator) | 0 | HTML（255 KB 单文件） | 2026-06-19 | 未确认（描述称已发 itch.io，无链接；无 README） | **无关** | `index.html` `<title>Fish the Fish</title>`，界面文案「Move harpoon with mouse • Click/SPACE to fire」= **鱼叉射击**，无浮漂 |
| 10 | lemnt-ai/fishing-wechat | [repo](https://github.com/lemnt-ai/fishing-wechat) | 1 | TypeScript (Cocos 3.8) | 2026-03-02 | ❌ 需 Cocos Creator + 微信开发者工具 | **无关** | `assets/scripts/HookController.ts` 点击下放鱼钩、60 秒限时；无浮漂（钩子垂直下放玩法） |
| 11 | XIA7XI/StardewValleyFishing | [repo](https://github.com/XIA7XI/StardewValleyFishing) | 1 | TypeScript (Vite+React) | 2025-11-19 | 未确认（README 给的是 Google AI Studio 链接） | **无关** | `components/FishingGame.tsx`：`barPosRef/fishPosRef/BAR_HEIGHT_PERCENT` = 星露谷式绿条罩鱼，无浮漂 |
| 12 | SkyWalker541/Gone-Fishing | [repo](https://github.com/SkyWalker541/Gone-Fishing) | 13 | Shell（LÖVE 打包） | 2026-10-31 | ❌ 掌机 PortMaster（releases） | **中** | README：「…bobbers, realistic casting and line physics…」，操作表「A … hold to reel, press to **strike**」「with a bobber: set the depth」 |
| 13 | tonychuhai/Cove | [repo](https://github.com/tonychuhai/Cove) | 63 | JavaScript（Three.js） | 2026-09-22 | ⚠️ 桌面壁纸；浏览器预览需 `npm start` | **低** | README：「鼠标是一根钓线，停在鱼群边上会有鱼咬钩，提到屏幕顶端就能把它拎出来」——无浮漂可视化，主体是鱼缸/兔子桌面场景（AGPL-3.0） |
| 14 | ffxiv-cyou/ffxiv-fishing-float | [repo](https://github.com/ffxiv-cyou/ffxiv-fishing-float) | 1 | TypeScript | 2026-11-20 | ✅ [fisher.ffxiv.cyou](https://fisher.ffxiv.cyou/)（200，但**是计时工具**） | **无关** | README：「鱼漂, a fishing timer for FFXIV」；仓库主体是 `public/data/2026.*/` 版本数据 → FFXIV 钓场窗口计时器，非游戏 |

### 关于 fishoria 的**更正**（重要）

Lead 备注称「fishoria 只有目录骨架、README 是营销文案、raw 拉 package.json 为空 → 大概率无可直接运行源码」。**该结论不成立，需更正**：

- raw 拉取为空是**网络问题**（核查后半程 `raw.githubusercontent.com` 稳定超时，`curl` code=000），不是文件缺失；
- 用 jsDelivr CDN 复核，仓库内是**完整可构建前端工程**：
  - `client/package.json` = **1878 B**（`pixi.js ^8.17.1`、`react ^19.2.4`、`vite`、`build: lint && tsc -b && vite build`）
  - `client/vite.config.ts` = **1353 B**；`client/src/` 下 **483 个源文件**；另有 `server/src/` **101 个文件**
  - `client/src/game/engine/entities/HookEntity.ts` = **12814 B**（浮漂下沉逻辑原文见上表）
  - `client/src/common/configs/game/detection.config.ts` = **4126 B**（咬口/早刺/超时参数）
- 线上站 `https://www.fishoria.online` HTTP **200**，可直接玩；
- 但确实**不是「打开 index.html 就能跑」**：client 依赖自己的 NestJS API / Postgres / Redis 才有完整账号与联机功能；license 为 `NOASSERTION`（仓库内 `LICENCE` 命名不规范）；README 营销味重、「state-of-the-art」等措辞不可当证据。

---

## 2. 自补候选（新搜到，已核实）

搜索用的 q（GitHub Search API）：`fishing bobber language:JavaScript`、`fishing float bite language:TypeScript`、`topic:canvas fishing`、`fishing 浮漂`、`fishing 台钓`、`topic:html5-game fishing`、`bobber fishing in:name,description`、`fishing idle language:JavaScript`、`carp fishing in:name,description`、`angling simulator in:name,description`、`topic:fishing-game language:JavaScript`、`topic:fishing language:HTML`、`fishing game language:html`，以及 `浮漂/调漂/顿口` 中文词（后者命中的几乎全是「钓鱼助手/教学/识漂 AI」，不是游戏）。

| # | 仓库全名 | 链接 | ⭐ | 语言 | 最后更新 | 能否在线玩 | 贴合度 | 一句话证据 |
|---|---|---|---|---|---|---|---|---|
| 15 | ANT-CYJ/fishing-basic | [repo](https://github.com/ANT-CYJ/fishing-basic) | 1 | HTML（单文件 52 KB） | 2026-08-16 | ✅ [ANT-CYJ.github.io/fishing-basic](https://ANT-CYJ.github.io/fishing-basic/) | **高（仅调漂维度，非游戏）** | README：「三个可动手的模拟器：**调漂（调四钓二）、找底（重铅找底）、打窝（少打勤补）**」；index.html 含 `半水/调目/钓目/浮漂` 关键词，**无鱼、无咬钩、无提竿** |
| 16 | Sumomo0222/first-person-fishing | [repo](https://github.com/Sumomo0222/first-person-fishing) | 0 | HTML/CSS/原生 JS | 2026-11-18 | ✅ [sumomo0222.github.io/first-person-fishing](https://sumomo0222.github.io/first-person-fishing/) | **中高** | `dist/script.js`(33072 B)：`nibbleTimes` 假口、`biteEnd = biteAt + 1650`（1.65s 窗口）、等待期点击→空竿、超时→`doMiss()`「鱼儿脱钩了」；`floatEl/biteMark` 浮漂+「!」 |
| 17 | a4215629/Fishing | [repo](https://github.com/a4215629/Fishing) | 0 | HTML（单文件 48 KB） | 2026-07-20 | ✅ [a4215629.github.io/Fishing](https://a4215629.github.io/Fishing/) | **中（只到「浮漂物理」，无鱼）** | README 标题「**浮漂走水受力分析仿真**」；可调吃铅 3g / 浮漂长度 / 水流速度，Canvas 里画受力平衡与浸入比例；`float_analysis_problem.md` 有完整公式推导 |
| 18 | ctbot000/fishing-game | [repo](https://github.com/ctbot000/fishing-game) | 0 | JavaScript（WebGL2 手写） | 2026-09-10 | ✅ [ctbot000.github.io/fishing-game](https://ctbot000.github.io/fishing-game/) | **低** | README：「Charge a cast, follow the hook down through eighty metres of water, **strike when something bites**」；跟着钩下沉，无浮漂可视化；MIT |
| 19 | hb-mw/fish-up | [repo](https://github.com/hb-mw/fish-up) | 0 | JavaScript（零依赖） | 2026-10-06 | ✅ [hb-mw.github.io/fish-up](https://hb-mw.github.io/fish-up/) | **低-中** | README：「**Bite (!)** press SPACE quickly — **early = perfect hook**」；侧视场景有 bobber，主体是张力溜鱼 |
| 20 | daiyu3659/fish | [repo](https://github.com/daiyu3659/fish) | 1 | HTML（three.js 3D） | 2026-11-13 | 未确认（有 `pages.yml`，homepage 为空，未取到线上地址） | **低-中** | README：「cast, wait for the bite, fight the fish」；`docs/screenshots/03_desktop_zh_bite.png` 有咬钩态；**浮漂是否可视化未确认**（未逐行读 3D 场景代码） |
| 21 | yurtemre7/samurai-hook | [repo](https://github.com/yurtemre7/samurai-hook) | 3 | TypeScript | 2026-11-18 | ✅ [yurtemre7.github.io/samurai-hook](https://yurtemre7.github.io/samurai-hook/) | **低** | 描述「A samurai goes fishing and every fish he hooks wants a duel」——钩住后变决斗，非读漂玩法 |
| 22 | teitasan/ThreeJs-Fishing-Game | [repo](https://github.com/teitasan/ThreeJs-Fishing-Game) | 4 | JavaScript | 2026-10-03 | ✅ [teitasan.github.io/ThreeJs-Fishing-Game](https://teitasan.github.io/ThreeJs-Fishing-Game/)（HTTP 200） | **未确认** | 只核实到「Three.js 3D 钓鱼游戏」+ 在线页 200；未逐行读玩法代码，**浮漂情况未确认** |

> 早期搜索（q1/q2）对 `fishing bobber language:JavaScript`、`fishing float bite language:TypeScript` 的返回总数为 **1 / 0**，侧面说明这个细分在 GitHub 上极其稀疏。

---

## 3. 最接近的 Top3 点评

### Sp1r1tual/fishoria
- **是游戏**：完整浏览器 WebGL2 钓鱼游戏（React19 + PixiJS8 + Redux），线上站可玩。
- **有浮漂**：`HookEntity.ts` 里 `rigType === 'float'` 时浮漂出水/入水都画，等待期漂浮。
- **有咬钩信号 + 时机**：等待期由鱼「兴趣」`maxInterest` 驱动 `sinkY` 上下微顿（`pulse > 0.09` 就出涟漪 `isDiving`）；`phase === 'bite'` 直接 `sinkY = 5*scale` 沉下去；`detection.config.ts` 有 `EARLY_HOOK.minInterest 0.35`（提前刺鱼按兴趣给概率）、`nibbleMultiplier 2.5`（约 71% 是小口试探）、`FISH_AI.biteTimeoutBase 3 + range 7`（不刺鱼鱼会吐钩走）。
- **台式要素**：三种钓组（float / feeder / spinning）、`groundbait`（打窝）+ `GroundbaitEffect.ts`、不同鱼种偏好深度、天气/时间。
- **差距**：欧式鲤钓（carp）语境，**没有「半水调目 → 找底 → 钓目」这套调漂流程**，也没有真正的立漂目数（几目）显示；没有中文台钓的「顿口/送漂/黑漂」分类；`README` 严重营销化，证据须以源码为准；license 不明（NOASSERTION），商用需谨慎。
- **工程**：monorepo（client + server + online_server），要装 Postgres/Redis 才有完整功能；**不能双击 index.html 就玩**。

### bridge-mind/tideline
- **是游戏**：Three.js 3D 钓鱼，**零构建、零 npm**，GitHub Pages 直接玩，是本次核查里「最省事可试玩」的一个。
- **有浮漂**：`src/gameplay/bobber.js` 建模了浮漂（球体+漂尾+示标），`dip` 用 `lerp` 平滑逼近，注释写明「bites read as a **sharp-but-smooth plunge**」。
- **有咬钩信号 + 时机**：`biteSystem.js` 抛竿后 wait 4–13s，`nibbleChance 0.65` 先来 1–2 次小口（`teaser nibbles`），真口时浮漂下顿并出 `!`，`hookWindowBase: 1.05s`（稀有鱼更短），点慢了鱼走。
- **差距**：无调漂、无目数、无饵料雾化/窝子；本质是街机化 3D 钓鱼+张力溜鱼，离「台钓」还有一层设计距离；21 种鱼/4 钓点/装备升级是本作重心。

### Sumomo0222/first-person-fishing
- **是游戏**：纯静态第一人称单页（HTML+CSS+SVG+JS），打开链接即玩，无依赖无构建。
- **最像「读漂提竿」**：`waiting` 期浮漂随波轻晃，`nibbleTimes` 制造一次「假口」轻点（README 原话「小心别上当」），真口时浮漂猛沉+红色「!」，`biteEnd = biteAt + 1650` 即 1.65s 窗口，等待期提前点=空竿，超时=`doMiss()`「鱼儿脱钩了」。
- **差距**：0 star、无 license（法律上不可直接复用）、10 种鱼、无调漂/无饵料状态/无窝子/无溜鱼张力；更接近「带漂相的小游戏 demo」而不是台钓模拟。

**另外两个值得单独记一笔的（不进 Top3 但做自研必看）**
- **ANT-CYJ/fishing-basic**：唯一把「调四钓二、重铅找底、打窝」做成**可动手模拟器**的项目（52 KB 单文件、有线上页），但它是教学动画，没有鱼和提竿判定 → 适合抄「调漂状态机 + 目数模型」。
- **izadoesdev/bobber-run**：`TEASES`/`FAKE_OUT`/`strikeWindows` 是全样本里最细的「假口 vs 真口」实现（fake-out = 大幅下顿+水花但**没有**「thump」），但浮漂只是俯视水面上的点+涟漪，且主体是帆船海盗游戏。

---

## 4. 排除名单（不是游戏 / 不能算「钓鱼游戏」）

### ⛔ 网络钓鱼（phishing）/ 攻击类 —— 必须排除，别混进结果
| 仓库 | ⭐ | 判定证据 |
|---|---|---|
| [Jason8445/fishing_web](https://github.com/Jason8445/fishing_web) | 38 | 伪造「逢甲大學 iLearn」Moodle 登录页（`<title>iLearn 逢甲大學</title>`；loginForm 无 action，submit 只显示「登入無效，請重試」；附 `test/screen_login.png`、`moodle4_log.jpg`）。典型凭证窃取页模板 |
| [HiDe-Techno-Tips/Blackeye-for-Windows](https://github.com/HiDe-Techno-Tips/Blackeye-for-Windows) | 151 | 描述自述「This is a **Phishing** tool. Phishing is … credential harvesting」 |
| [a1phard/Fishing-Plan](https://github.com/a1phard/Fishing-Plan) | 4 | 描述「邮件钓鱼演练平台，钓鱼邮件」（中文「钓鱼」= 网络攻击） |

> 关键词命中「钓鱼」的中文仓库里，这两类（phishing / 钓鱼邮件演练）占比很高；star 高不代表相关。另有一批 **2026-11-23 当天集中创建的「Fishing Game Trainer/Cheat」SEO 垃圾仓库**（如 `TheVarleX/How-To-Fish-Enhanced-Input`、`markbrouer/How-to-Fish-Gameplay-Companion`、`dnyandipbhalerao336-cloud/ReelForge-MoggyDay-TrainerHub`，各约 55 star），实为外挂/引流页，**排除**。

### 🤖 外挂 / 自动钓鱼脚本（不是游戏）
| 仓库 | ⭐ | 证据 |
|---|---|---|
| [soockee/pixel-bot-go](https://github.com/soockee/pixel-bot-go) | 28 | 「WoW fishing pixel bot … automates WoW **bobber detection**」 |
| [jere357/fishermansfriend](https://github.com/jere357/fishermansfriend) | 15 | WoW 自动钓鱼，yolov3 识别浮漂 |
| [disarmyouwitha/bobber_bot](https://github.com/disarmyouwitha/bobber_bot) | 9 | WoW 自动钓鱼 bot |
| [julianperrott/FishingFun](https://github.com/julianperrott/FishingFun) | 306 | 「WOW Fishing Bot」 |

### 🛠️ 钓鱼助手 / 识漂 AI / 教学文本（非游戏，但证明「浮漂」需求真实存在）
- [TheZafkiel/Delta-fishing](https://github.com/TheZafkiel/Delta-fishing)（0★，Python，「三角洲行动台钓助手：**漂尾识别**、倒计时与血量提醒」）
- [furui123456788/fishing-master](https://github.com/furui123456788/fishing-master)（1★，PWA，「**AI 浮漂识别**」）
- [hellomrli/forever-fishing-zh](https://github.com/hellomrli/forever-fishing-zh)（0★，「**浮漂与水花确认**」）
- [SunnyPanzhen/fishing-skill](https://github.com/SunnyPanzhen/fishing-skill)（3★，台钓/调漂 文本 Skill）、[jinliangliu/freshwater-fishing](https://github.com/jinliangliu/freshwater-fishing)（0★）
- [crom-lmc/fishing-guide-miniprogram](https://github.com/crom-lmc/fishing-guide-miniprogram)（6★，钓鱼指南小程序，不玩游戏）

### 🎣 其他「像钓鱼游戏但无关浮漂」
- [AmethystineAlpaca/thank-you-for-the-fish](https://github.com/AmethystineAlpaca/thank-you-for-the-fish)（27★，Mac 桌面挂机钓鱼）
- [teitasan/ThreeJs-Fishing-Game](https://github.com/teitasan/ThreeJs-Fishing-Game)（4★，见上表 #22，浮漂未确认）
- [Janxyxy/FishingSimulator](https://github.com/Janxyxy/FishingSimulator)（1★，HTML）、[sunnyz689/fishing-idle](https://github.com/sunnyz689/fishing-idle)（0★，挂机）——未逐行核查，仅按描述归为「通用钓鱼/挂机」

---

## 5. 逐项点评（已知候选 14 个，一段话/个）

1. **ava-agent/fish-agent（2★，Expo/RN 像素风）**：中文钓鱼游戏里完成度最高之一，`Bobber` 组件会在咬钩时抖动，`hookTimeout 2500` 是真正的 2.5 秒提竿窗口；但「台钓」只出现在百科文案（「5 种钓法：台钓/底钓/路亚/飞蝇/夜钓」），核心是张力溜鱼+AI 生物养成，且 README 声称 MIT 但仓库**没有 LICENSE 文件**（GitHub 识别不到 license），复用前需确认。在线站 HTTP 200。
2. **bridge-mind/tideline（11★，Three.js 零构建）**：本次核查里「工程最干净 + 可试玩 + 有浮漂信号」性价比最高，`bobber.js` / `biteSystem.js` / `config.js` 三层把「浮漂下沉 + 1.05s 窗口 + 假口」写得很清楚，MIT 可复用；缺台钓的调漂与饵料系统。
3. **Sp1r1tual/fishoria（4★，TS monorepo）**：源码证据最扎实（483 个 client/src 文件、`HookEntity` 浮漂微顿、`detection.config` 早刺/小口/超时、`groundbait` 打窝），是本报告唯一给出「高」的游戏；但工程需后端、license 不明、README 过度营销（**不能仅凭 README 判断其可运行性——本次已用 jsDelivr 字节级复核**）。
4. **littensy/fishing-minigame（79★，Luau/Roblox）**：star 最高，是 Fisch 的复刻（reactive signals、确定性 fixed-step 模拟、服务端重放防作弊），工程规范（CI + selene + stylua + 测试）；但平台是 Roblox，不是 HTML，且玩法是「把鱼保持在控制条内」，**没有读漂**。
5. **mrsperry/fishing-enterprises（28★，jQuery 挂机）**：老式点击挂机，`fishing.js` 里只有「抛线/收线 + 按概率随机上鱼」，全部鱼类掉落靠概率表；无浮漂、无时机，仅作「idle 钓鱼」参考。
6. **Jason8445/fishing_web（38★）**：见 §4，**假冒校方登录页，属钓鱼攻击仓库，剔除**。它 star 不低，最容易误判，务必在报告中保留这条警示。
7. **sharkbuster/howtofish（0★，单文件 Canvas2D）**：中文「渔力全开 2D 致敬版」，浮标+咬钩「!」画得清楚，还带 86 断言的无头测试（`_verify.js`，能真跑 Canvas）；但 **`bite` 状态没有倒计时**，玩家可以「想什么时候提就什么时候提」，与台钓「过早/过晚失败」的核心压力不符；游戏重心其实是鱼上岸后变「疯鱼」再用枪打。
8. **izadoesdev/bobber-run（3★，TS/WebGL2）**：钓鱼是帆船游戏的一个子系统，但它的**信号系统是全样本最考究的**：不同鱼种有不同 `TEASES`（darter 连顿两下、jumper 水面打花…），`FAKE_OUT` 概率制造「大沉+水花但无 thump」的假口，`strikeWindows` 分 perfect/普通两档并随失误放宽（保底机制）。俯视视角、浮漂只是水面点，无立漂形态。
9. **redcobra1652/fishing-simulator（0★）**：名字最像钓鱼模拟器，实际是「Fish the Fish」鱼叉射击（鼠标移动鱼叉、点击发射），255 KB 单文件 Canvas，无 README、无 license，**与鱼漂完全无关**。
10. **lemnt-ai/fishing-wechat（1★，Cocos）**：微信小游戏骨架完整（scene、HookController、鱼群 AI、微信登录/分享/排行、程序化资源生成），但玩法是「钩子垂直下放 + 60 秒限时」，没有浮漂，也跑不成网页。
11. **XIA7XI/StardewValleyFishing（1★）**：README 是 Google AI Studio 模板（「Run and deploy your AI Studio app」），核心 `FishingGame.tsx` 是星露谷「绿条罩住鱼」的物理小游戏，`FISH_TYPES/FLOATER` 只是鱼的浮动偏好；无浮漂，在线可玩性未确认。
12. **SkyWalker541/Gone-Fishing（13★，LÖVE）**：完成度高的掌机游戏（45 鱼 / 10 拟饵 / 66 成就 / 天气 / 线物理），README 明确写 bobbers、`press to strike`、`with a bobber: set the depth`，是「有浮漂+刺鱼」的**非网页**样本；LÖVE 引擎，纯网页不可用；license CC BY-NC-ND 4.0（**禁止改编**）。
13. **tonychuhai/Cove（63★，桌面壁纸）**：Three.js 桌面活场景，鱼缸场景里「鼠标=钓线，停鱼群边会咬钩，提线收鱼」（代码 `scenes/riverscape/src/tackle.js`），是有「咬钩」概念的创意作品；但不是钓鱼游戏（没有鱼漂、没有提竿判定），也不是网页版（Mac 壁纸 App + Windows WebView2；浏览器只是开发预览）。AGPL-3.0。
14. **ffxiv-cyou/ffxiv-fishing-float（1★）**：中文「鱼漂」但实为 **FFXIV 钓鱼窗口计时器**（fisher.ffxiv.cyou），仓库主体是每次游戏版本更新的 `item/opcode/place` 数据。**不是游戏，也不是模拟浮漂**——名字极易误判。

---

## 6. 判断依据 & 可复现方法

- **star/时间/语言/license**：`https://api.github.com/search/repositories?q=repo:owner/a+repo:owner/b&per_page=30`（批量一次查多个仓库，省额度；本机 core API 已 403，`/repos/<owner>/<repo>` 不可用）。
- **文件清单**：`https://data.jsdelivr.com/v1/packages/gh/<owner>/<repo>@HEAD?structure=flat`（免额度，返回全量文件路径）。
- **文件内容**：`https://cdn.jsdelivr.net/gh/<owner>/<repo>@HEAD/<path>`（jsDelivr 对 `README.md`/`index.html` 会 301 到 raw，若 raw 超时可改用 codeload）。
- **小仓库整包**：`https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`（≤1 MB 的仓库才用；大仓库未 clone）。
- **在线可玩性**：对每个 homepage / Pages / 线上域名做 `curl -o /dev/null -w "%{http_code}"`，本次实测均 **HTTP 200**：fish.rxcloud.group、www.fishoria.online、bridge-mind.github.io/tideline、sharkbuster.github.io/howtofish、mrsperry.github.io/fishing-enterprises、fisher.ffxiv.cyou、ctbot000.github.io/fishing-game、hb-mw.github.io/fish-up、sumomo0222.github.io/first-person-fishing、ANT-CYJ.github.io/fishing-basic、a4215629.github.io/Fishing、yurtemre7.github.io/samurai-hook、teitasan.github.io/ThreeJs-Fishing-Game；bobber-run 无公开部署；daiyu3659/fish 的 Pages 地址未确认。
- **未确认项**：`redcobra` itch.io 链接、`daiyu3659/fish` 线上地址与浮漂实现、`XIA7XI` 的 AI Studio 是否公开可玩、`teitasan` 玩法细节、`izadoesdev/bobber-run` 是否有部署 —— 均标「未确认」，未编造。
- **无法核实 star 更高仓库的 license/详情**：因 core API 403，仅能依赖 search API 返回的字段（含 license、pushed_at，可信）。star 数为 2026-11-23 17:19–17:30 快照，会随时间变动。

---

## 7. 给下一步的建议（超出核查范围，仅供参考）

1. 若要「真正模拟鱼漂」的玩法原型，最小可行闭环应是：**调漂（半水调目→找底→钓目）→ 饵料状态/雾化 → 打窝 → 漂相（小口/顿口/送漂/黑漂的图形与时长差异）→ 提竿窗口（含假口与过早/过晚惩罚）**，现有开源项目只覆盖其中 1–2 段。
2. 可直接借鉴的代码片段：tideline `bobber.js`（浮漂缓动/下沉）、bobber-run `TEASES/FAKE_OUT/strikeWindows`（假口状态机）、fishoria `HookEntity`（按鱼兴趣驱动微顿）、ANT-CYJ（调四钓二/找底/打窝 的交互模型与目数概念）。
3. 不要用 fishoria README 当技术依据（营销文案），要用 `detection.config.ts` / `HookEntity.ts` 这类参数文件；也不要把「fishing」当关键词直接搜——中文「钓鱼」大量命中网络钓鱼攻击仓库，需先看文件树再判断。
