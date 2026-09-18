/* English / Chinese strings. t("key", {var: 1}) looks one up;
   static text in the page is tagged with data-i18n. */
(function (global) {
  "use strict";

  var DICT = {
    zh: {
      "ui.title": "SurroScope · 代理模型结果对比看板",
      "ui.subtitle": "上传输入数据 / 模型文件夹只提取名字；结果图片会保存下来用于并排对比。",
      "ui.export": "导出项目",
      "ui.import": "导入项目",
      "ui.theme.toDark": "深色",
      "ui.theme.toLight": "浅色",
      "ui.lang": "中文 / English",
      "ui.langTitle": "切换语言 / Switch language",

      "sec.data": "输入数据 / 模型结果",
      "hint.data": "模型会按文件名里的参数自动挂到对应的输入数据下面",
      "group.unassigned": "未归类的模型",
      "group.unassignedHint": "文件名参数没匹配上任何输入数据，可以用右边的下拉框手动指定",
      "group.modelCount": "{n} 个模型",
      "group.noModels": "这个输入数据下面还没有模型",
      "assign.title": "改挂到别的输入数据",
      "assign.none": "（不指定输入数据）",
      "confirm.deleteInput": "删除输入数据「{name}」？\n下面的 {n} 个模型会变成未归类，不会被删除。",
      "empty.noData": "还没有内容。把结果文件夹拖进右边的框即可，输入数据会自动推导出来。",
      "sec.storage": "存储位置",
      "sec.case": "工况 Case",
      "sec.input": "输入数据",
      "sec.model": "模型结果",
      "sec.compare": "对比视图",

      "nav.data": "数据 / 模型",
      "nav.compare": "对比",
      "nav.jump": "跳到数据…",
      "nav.jumpTitle": "跳到某份输入数据的分组",
      "nav.top": "↑ 顶部",

      "btn.collapseAll": "全部折叠",
      "btn.expandAll": "全部展开",
      "model.toggleImages": "折叠 / 展开这个模型的图片",
      "model.imagesCollapsed": "{n} 张图已折叠，点这里展开",
      "model.noImagesYet": "还没有图片，点这里添加",
      "ask.deleteInput.title": "删除输入数据",
      "ask.deleteInput.body": "「{name}」下面挂着 {n} 个模型。这些模型要怎么处理？",
      "ask.keepModels": "保留模型（变成未归类）",
      "ask.deleteModels": "连 {n} 个模型一起删除",
      "ask.cancel": "取消",
      "confirm.deleteInputEmpty": "删除输入数据「{name}」？",
      "btn.mergeCase": "合并 case…",
      "ask.mergeCase.title": "合并 case",
      "ask.mergeCase.body": "把「{name}」的全部输入数据和模型并到哪个 case 里？原 case 会被删掉。",
      "confirm.mergeCase": "已经有叫「{to}」的 case 了。把「{from}」整个并进去吗？",
      "msg.merged": "已把「{from}」并入「{to}」。",
      "btn.newCase": "+ 新建 case",
      "hint.input": "只读取文件名，不读文件内容",
      "hint.model": "只提取文件夹名和内部文件结构；文件夹里的图片会自动识别并保存",
      "dz.input.title": "点击选择输入数据文件，或拖到这里",
      "dz.input.sub": "任意格式（.mat / .h5 / .npz / .csv …），只取文件名；可一次选多个",
      "dz.model.title": "点击选择模型文件夹",
      "dz.model.sub": "可一次拖多个文件夹，或直接拖父文件夹；认得出的超参数会自动打标签",

      "dz.result.title": "点击选择结果文件夹（自动推导输入数据）",
      "dz.result.sub": "文件夹名 = 模型名，去掉末尾的超参数后缀 = 输入数据名；可一次拖多个，或直接拖父文件夹",
      "input.derived": "推导",
      "input.derivedTitle": "这份输入数据是从模型文件夹名推导出来的，还没上传过对应的 .mat",
      "msg.resultImported": "已导入「{name}」：输入数据 {input}，识别到 {n} 张图片。",
      "msg.resultNoImg": "已导入「{name}」：输入数据 {input}，但文件夹里没找到图片。",
      "cmp.paramFilter": "筛选",
      "cmp.plotType": "图片类型",

      "cmp.all": "全部",
      "cmp.reset": "重置筛选",
      "cmp.noneMatch": "当前筛选条件下没有模型。",
      "cmp.noPlotType": "图片类型都被关掉了，勾一个回来。",
      "cmp.filterHint": "只列出在当前 case 里有多个取值的参数",
      "cmp.layout": "排列",
      "cmp.layout.byModel": "每个模型一行",
      "cmp.layout.byKind": "按图片类型分组",
      "cmp.cols": "每行",
      "cmp.cols.auto": "自动",

      "lb.prev": "← 上一张",
      "lb.next": "下一张 →",
      "lb.close": "关闭 ✕",

      "foot.note": "数据保存在本地。换电脑或清理浏览器数据前，请先「导出项目」或绑定本地文件夹。",

      "slot.traj": "轨迹对照图",
      "slot.error": "误差图",
      "slot.other": "其他",

      "cmp.markFilter": "标注",
      "mark.bucket.star": "★ 最好",
      "mark.bucket.up": "👍 好",
      "mark.bucket.down": "👎 不好",
      "mark.bucket.none": "未标注",
      "mark.pick": "标注这个模型的结果",
      "mark.opt.none": "— 未标注",
      "mark.opt.star": "★ 最好",
      "mark.opt.up": "👍 好",
      "mark.opt.down": "👎 不好",
      "star.badge": "最好",
      "common.delete": "删除",
      "common.moveTo": "移动到其他 case",

      "empty.noCase": "还没有 case。直接把结果文件夹拖进来就会自动建，也可以点上面的「+ 新建 case」。",
      "empty.noInput": "还没有输入数据。",
      "empty.noModel": "还没有模型。上传一个模型结果文件夹试试。",
      "empty.selectModel": "勾选上面的模型来对比。",
      "empty.noThisImage": "没有这张图",
      "empty.noImage": "这个模型还没有图片",

      "case.counts": "{i}数据/{m}模型",
      "model.tree": "文件结构（{n} 个文件）",
      "model.treeMore": "… 还有 {n} 个文件",
      "model.diff": "⚠ 与输入数据「{name}」不一致：",

      "slot.add": "+ 添加图片",
      "slot.click": "点击或拖入图片",
      "img.failed": "图片读取失败",
      "img.needAccess": "需要先「恢复访问」文件夹",

      "msg.imported": "已导入「{name}」：识别到 {n} 张图片，其余 {rest} 个文件只记录了名字。",
      "msg.importedNoImg": "已导入「{name}」（共 {n} 个文件）。文件夹里没有图片，可以在下面的图片槽里手动上传。",
      "msg.allSkipped": "「{name}」没有需要更新的：{n} 张图都没改动过。",
      "msg.allSkippedBatch": "检查了 {folders} 个文件夹，没有需要更新的：{n} 张图都没改动过。",
      "msg.skippedSuffix": "（跳过 {n} 张未改动的）",
      "msg.reading": "正在读取文件夹…",
      "msg.batchImported": "批量导入完成：{folders} 个文件夹，{images} 张图片。",
      "msg.batchNoImg": "批量导入了 {folders} 个文件夹，但没找到图片。",
      "msg.importPartial": "导入完成：{folders} 个文件夹 / {images} 张图片；有 {failed} 项失败（按 F12 看控制台里的详情）。",
      "msg.itemFailed": "「{what}」失败：{e}",
      "msg.noImgUnviewable": "「{name}」里找到 {list}，但浏览器显示不了这种格式。请在 MATLAB 里用 exportgraphics 另存成 png / pdf / svg 再传。",
      "msg.noImgFound": "「{name}」里没有可识别的图片。里面的文件是：{list}",
      "msg.hintLongPath": " ← 大概率是路径太长：Windows 完整路径上限 260 字符，而这个文件光相对路径就 {len} 字符（再加上前面的 C:/Users/… 会更长），浏览器打不开。办法：把文件夹挪到更短的目录（比如 C:/r9/），或者把文件名改短（文件名里不必再重复一遍文件夹名）。",
      "msg.packing": "正在打包项目…",
      "msg.exported": "已导出（含 {n} 张图片）。",
      "msg.exportedPartial": "已导出，但有 {missing} 张图片读不出来，没被打包进去（共 {total} 张）。导入这个文件后这些图会是空的。",
      "msg.exportNeedAccess": "导出前请先点「恢复访问」——现在还读不到本地文件夹，导出来的文件里一张图都不会有。",
      "msg.exportFail": "导出失败：{e}",
      "confirm.import": "导入会覆盖当前所有内容，确定继续？",
      "msg.importDone": "导入完成（恢复 {n} 张图片）。",
      "msg.importFail": "导入失败：{e}",
      "msg.importBadJson": "导入失败：不是合法的 JSON",
      "msg.importBadFile": "导入失败：不是本看板导出的项目文件",

      "confirm.deleteModel": "删除模型「{name}」及其图片？",
      "confirm.deleteCase": "删除 case「{name}」及其所有模型和图片？",
      "prompt.renameCase": "重命名 case：",
      "prompt.newCase": "case 名称（一个工况 / 一个问题，例如 airfoil 或 2phase_cenX6464）：",

      "storage.browser": "浏览器内部存储",
      "storage.browserDefault": "浏览器内部存储（默认）",
      "storage.pick": "选择本地文件夹…",
      "storage.bound": "✓ 本地文件夹：",
      "storage.needPerm": "⚠ 需要重新授权：",
      "storage.restore": "恢复访问",
      "storage.useBrowser": "改用浏览器存储",
      "storage.changeFolder": "换个文件夹…",
      "storage.hint.unsupported": "当前浏览器不支持选择本地文件夹（建议用 Chrome / Edge）",
      "storage.hint.pick": "选一个文件夹后，图片会以真实文件写进去（可以放在 Box 里同步、备份）",
      "storage.hint.needPerm": "浏览器重启后需要点一次确认（浏览器安全限制），图片才能重新显示",
      "storage.hint.bound": "图片写在 <文件夹>/<case>/<模型文件夹>/ 下，元数据写在 {manifest}",
      "msg.hintQuota": " ← 浏览器存储满了。建议在顶部「存储位置」改用「本地文件夹」（图片直接写成磁盘文件，没有容量限制），或者先「导出项目」备份后删掉一些 case。",
      "storage.usage": " · 浏览器内已用 {used} / {quota}",
      "storage.notPersisted": "（未持久化：浏览器磁盘紧张时可能清掉，重要结果请绑定本地文件夹或导出备份）",
      "storage.isPersisted": "（已申请持久化）",
      "storage.used": " · 已占用约 {size}",
      "storage.unnamedFolder": "(已选文件夹)",
      "case.untitled": "未命名 case",
      "msg.switchFail": "切换失败：{e}",

      "msg.noWritePerm": "没有拿到文件夹的写入权限。",
      "msg.pickFail": "选择文件夹失败：{e}",
      "msg.stillNoPerm": "仍然没有拿到访问权限。",
      "msg.authFail": "授权失败：{e}",
      "msg.bound": "已绑定文件夹「{name}」。",
      "msg.boundMigrated": "已绑定文件夹「{name}」，{n} 张图片已写入磁盘。",
      "msg.loadedFromFolder": "已载入文件夹「{name}」里的项目。",
      "confirm.folderHasData": "这个文件夹里已经有项目数据（{n} 个 case）。\n\n【确定】载入文件夹里的数据（覆盖当前页面内容）\n【取消】保留当前内容，并把当前的图片写进这个文件夹",
      "confirm.unbind": "改回浏览器内部存储？\n会把图片复制回浏览器，磁盘上已有的文件不会被删除。",
      "confirm.unbindNoAccess": "现在还没有这个文件夹的访问权限，改回浏览器存储的话一张图都取不回来（磁盘上的文件不会删，但页面里会全部显示不出来）。\n\n建议先点「恢复访问」。确定仍然要改回浏览器存储吗？",
      "msg.unbound": "已改回浏览器内部存储。",
      "msg.unboundN": "已改回浏览器内部存储，取回 {n} 张图片。",
      "msg.unboundNoAccess": "已改回浏览器内部存储，但因为没有文件夹权限，{n} 张图片没能取回来（磁盘上的文件还在，重新绑定这个文件夹就能恢复）。",
      "msg.unboundPartial": "已改回浏览器内部存储：取回 {n} 张，{failed} 张读不出来（磁盘上的文件还在）。",
      "msg.manifestUnreadable": "这个文件夹里有 {manifest}，但读不出来（{e}）。为免覆盖掉里面已有的项目，这次没有绑定。如果文件在云盘里还是占位状态，先在资源管理器里打开一次让它同步下来。",
      "msg.migratePartial": "已绑定文件夹「{name}」，写入 {n} 张图片；另有 {failed} 张没能搬过来（原文件夹里读不到，元数据里仍保留着它们）。",
      "msg.manifestFail": "清单写入失败：{e}",
      "msg.saveFail": "保存失败：{e}",
      "msg.initFail": "无法初始化本地存储：{e}。请用 Chrome / Edge 打开，或检查浏览器是否禁用了网站数据。",

      "param.size": "样本量",
      "param.medium": "介质",
      "param.mem": "mem",
      "param.inj": "inj",
      "param.rec": "rec",
      "param.log": "log",
      "param.sample": "采样",
      "param.injMode": "注入",
      "param.act": "激活",
      "param.switch": "开关",
      "param.date": "日期",
      "param.arch": "网络",
      "param.layer": "层数",
      "param.node": "节点",
      "param.bs": "BatchSize",
      "param.lr": "学习率",
      "param.epoch": "轮数",
      "param.seed": "seed"
    },

    en: {
      "ui.title": "SurroScope · Surrogate Model Result Comparison",
      "ui.subtitle": "Input data and model folders contribute names only; the result plots are stored for side-by-side comparison.",
      "ui.export": "Export project",
      "ui.import": "Import project",
      "ui.theme.toDark": "Dark",
      "ui.theme.toLight": "Light",
      "ui.lang": "中文 / English",
      "ui.langTitle": "切换语言 / Switch language",

      "sec.data": "Input data & model results",
      "hint.data": "Models are filed under the matching input data automatically, based on the parameters in their name",
      "group.unassigned": "Unassigned models",
      "group.unassignedHint": "Their name parameters matched no input data — assign one with the dropdown on the right",
      "group.modelCount": "{n} models",
      "group.noModels": "No models under this input data yet",
      "assign.title": "Re-assign to another input data",
      "assign.none": "(no input data)",
      "confirm.deleteInput": "Delete input data “{name}”?\nThe {n} model(s) below become unassigned; they are not deleted.",
      "empty.noData": "Nothing here yet. Drop your result folders into the right-hand box — the input data is inferred.",
      "sec.storage": "Storage location",
      "sec.case": "Cases",
      "sec.input": "Input data",
      "sec.model": "Model results",
      "sec.compare": "Comparison",

      "nav.data": "Data / models",
      "nav.compare": "Comparison",
      "nav.jump": "Jump to dataset…",
      "nav.jumpTitle": "Jump to one input dataset's group",
      "nav.top": "↑ Top",

      "btn.collapseAll": "Collapse all",
      "btn.expandAll": "Expand all",
      "model.toggleImages": "Collapse / expand this model's images",
      "model.imagesCollapsed": "{n} image(s) collapsed — click to expand",
      "model.noImagesYet": "No images yet — click to add",
      "ask.deleteInput.title": "Delete input data",
      "ask.deleteInput.body": "“{name}” has {n} model(s) under it. What should happen to them?",
      "ask.keepModels": "Keep them (become unassigned)",
      "ask.deleteModels": "Delete them too ({n})",
      "ask.cancel": "Cancel",
      "confirm.deleteInputEmpty": "Delete input data “{name}”?",
      "btn.mergeCase": "Merge case…",
      "ask.mergeCase.title": "Merge case",
      "ask.mergeCase.body": "Move everything in “{name}” into which case? The original case is then removed.",
      "confirm.mergeCase": "A case named “{to}” already exists. Merge “{from}” into it?",
      "msg.merged": "Merged “{from}” into “{to}”.",
      "btn.newCase": "+ New case",
      "hint.input": "Only the file name is read — never the file contents",
      "hint.model": "Only the folder name and file structure are read; images inside are detected and saved",
      "dz.input.title": "Click to choose input data files, or drop them here",
      "dz.input.sub": "Any format (.mat / .h5 / .npz / .csv …) — only the name is read; multiple files allowed",
      "dz.model.title": "Click to choose a model folder",
      "dz.model.sub": "Drop many folders at once, or their parent folder; recognised hyperparameters get tagged automatically",

      "dz.result.title": "Click to choose a result folder (input data inferred)",
      "dz.result.sub": "Folder name = model name, minus the trailing hyperparameter suffix = input data name; drop many at once, or a parent folder",
      "input.derived": "inferred",
      "input.derivedTitle": "This input data was inferred from a model folder name; its .mat has not been uploaded",
      "msg.resultImported": "Imported “{name}”: input data {input}, {n} image(s) detected.",
      "msg.resultNoImg": "Imported “{name}”: input data {input}, but no images were found in the folder.",
      "cmp.paramFilter": "Filter",
      "cmp.plotType": "Plot type",

      "cmp.all": "All",
      "cmp.reset": "Reset filters",
      "cmp.noneMatch": "No models match the current filter.",
      "cmp.noPlotType": "All plot types are switched off — turn one back on.",
      "cmp.filterHint": "Only parameters with more than one value in this case are listed",
      "cmp.layout": "Layout",
      "cmp.layout.byModel": "One row per model",
      "cmp.layout.byKind": "Group by plot type",
      "cmp.cols": "Per row",
      "cmp.cols.auto": "Auto",

      "lb.prev": "← Prev",
      "lb.next": "Next →",
      "lb.close": "Close ✕",

      "foot.note": "Everything is stored locally. Before switching machines or clearing browser data, use “Export project” or bind a local folder.",

      "slot.traj": "Trajectory plot",
      "slot.error": "Error plot",
      "slot.other": "Other",

      "cmp.markFilter": "Mark",
      "mark.bucket.star": "★ best",
      "mark.bucket.up": "👍 good",
      "mark.bucket.down": "👎 poor",
      "mark.bucket.none": "unmarked",
      "mark.pick": "Rate this model's result",
      "mark.opt.none": "— unmarked",
      "mark.opt.star": "★ best",
      "mark.opt.up": "👍 good",
      "mark.opt.down": "👎 poor",
      "star.badge": "best",
      "common.delete": "Delete",
      "common.moveTo": "Move to another case",

      "empty.noCase": "No cases yet. Drop a result folder in and one is created automatically, or click “+ New case” above.",
      "empty.noInput": "No input data yet.",
      "empty.noModel": "No models yet. Try uploading a model result folder.",
      "empty.selectModel": "Tick the models above to compare them.",
      "empty.noThisImage": "No such plot",
      "empty.noImage": "This model has no images yet",

      "case.counts": "{i} data / {m} models",
      "model.tree": "File structure ({n} files)",
      "model.treeMore": "… and {n} more files",
      "model.diff": "⚠ Differs from input data “{name}”:",

      "slot.add": "+ Add image",
      "slot.click": "Click or drop an image",
      "img.failed": "Could not load image",
      "img.needAccess": "Click “Restore access” first",

      "msg.imported": "Imported “{name}”: {n} image(s) detected; the other {rest} file(s) contributed names only.",
      "msg.importedNoImg": "Imported “{name}” ({n} files). No images found — you can add them manually in the slots below.",
      "msg.allSkipped": "Nothing to update in “{name}” — all {n} image(s) unchanged.",
      "msg.allSkippedBatch": "Checked {folders} folders, nothing to update — all {n} image(s) unchanged.",
      "msg.skippedSuffix": " ({n} unchanged image(s) skipped)",
      "msg.reading": "Reading folders…",
      "msg.batchImported": "Batch import done: {folders} folders, {images} images.",
      "msg.batchNoImg": "Imported {folders} folders, but no images were found.",
      "msg.importPartial": "Imported {folders} folders / {images} images; {failed} item(s) failed (press F12 for details in the console).",
      "msg.itemFailed": "“{what}” failed: {e}",
      "msg.noImgUnviewable": "Found {list} in “{name}”, but the browser cannot display that format. Re-export as png / pdf / svg (MATLAB: exportgraphics) and upload again.",
      "msg.noImgFound": "No recognisable images in “{name}”. It contains: {list}",
      "msg.hintLongPath": " ← most likely the path is too long: Windows caps a full path at 260 characters, and this file's relative path alone is {len} (the real one is longer still), so the browser cannot open it. Fix: move the folder somewhere shorter (e.g. C:/r9/), or shorten the file names (they need not repeat the folder name).",
      "msg.packing": "Packing project…",
      "msg.exported": "Exported ({n} images included).",
      "msg.exportedPartial": "Exported, but {missing} of {total} images could not be read and were left out. They will be blank if you import this file.",
      "msg.exportNeedAccess": "Click “Restore access” before exporting — the local folder is not readable right now, so the export would contain no images at all.",
      "msg.exportFail": "Export failed: {e}",
      "confirm.import": "Importing will replace everything currently loaded. Continue?",
      "msg.importDone": "Import complete ({n} images restored).",
      "msg.importFail": "Import failed: {e}",
      "msg.importBadJson": "Import failed: not valid JSON",
      "msg.importBadFile": "Import failed: not a project file exported from this dashboard",

      "confirm.deleteModel": "Delete model “{name}” and its images?",
      "confirm.deleteCase": "Delete case “{name}” with all its models and images?",
      "prompt.renameCase": "Rename case:",
      "prompt.newCase": "Case name (one problem / setup, e.g. airfoil or 2phase_cenX6464):",

      "storage.browser": "Browser storage",
      "storage.browserDefault": "Browser storage (default)",
      "storage.pick": "Choose a local folder…",
      "storage.bound": "✓ Local folder:",
      "storage.needPerm": "⚠ Needs re-authorisation:",
      "storage.restore": "Restore access",
      "storage.useBrowser": "Switch to browser storage",
      "storage.changeFolder": "Change folder…",
      "storage.hint.unsupported": "This browser cannot pick a local folder (use Chrome / Edge)",
      "storage.hint.pick": "Pick a folder and images are written there as real files (e.g. inside Box, so they sync and back up)",
      "storage.hint.needPerm": "After a browser restart you must confirm once (browser security rule) before images can load",
      "storage.hint.bound": "Images go to <folder>/<case>/<model folder>/, metadata to {manifest}",
      "msg.hintQuota": " ← browser storage is full. Switch “Storage location” at the top to a local folder (images become real files, no size cap), or export the project and delete some cases first.",
      "storage.usage": " · {used} / {quota} used in the browser",
      "storage.notPersisted": " (not persisted: the browser may evict this when disk runs low — bind a local folder or export a backup for anything important)",
      "storage.isPersisted": " (persistent storage granted)",
      "storage.used": " · about {size} used",
      "storage.unnamedFolder": "(selected folder)",
      "case.untitled": "Untitled case",
      "msg.switchFail": "Switch failed: {e}",

      "msg.noWritePerm": "Write permission for the folder was not granted.",
      "msg.pickFail": "Could not open the folder: {e}",
      "msg.stillNoPerm": "Access still not granted.",
      "msg.authFail": "Authorisation failed: {e}",
      "msg.bound": "Bound to folder “{name}”.",
      "msg.boundMigrated": "Bound to folder “{name}” — {n} image(s) written to disk.",
      "msg.loadedFromFolder": "Loaded the project from folder “{name}”.",
      "confirm.folderHasData": "This folder already contains project data ({n} cases).\n\n[OK] Load the data from the folder (replaces what is on screen)\n[Cancel] Keep what is on screen and write its images into this folder",
      "confirm.unbind": "Switch back to browser storage?\nImages are copied back into the browser; files already on disk are kept.",
      "confirm.unbindNoAccess": "The folder is not accessible yet, so no image can be copied back — the files stay on disk, but nothing will display in the page.\n\nClicking “Restore access” first is recommended. Switch to browser storage anyway?",
      "msg.unbound": "Switched back to browser storage.",
      "msg.unboundN": "Switched back to browser storage — {n} image(s) retrieved.",
      "msg.unboundNoAccess": "Switched back to browser storage, but without folder access {n} image(s) could not be retrieved. The files are still on disk — re-bind this folder to get them back.",
      "msg.unboundPartial": "Switched back to browser storage: {n} image(s) retrieved, {failed} could not be read (their files are still on disk).",
      "msg.manifestUnreadable": "This folder has a {manifest}, but it could not be read ({e}). Nothing was bound, so the project already in there is not overwritten. If the file is still a cloud placeholder, open it once in File Explorer to sync it.",
      "msg.migratePartial": "Bound to folder “{name}” — {n} image(s) written; {failed} could not be carried over (unreadable in the previous location, their entries are kept).",
      "msg.manifestFail": "Could not write the manifest: {e}",
      "msg.saveFail": "Save failed: {e}",
      "msg.initFail": "Could not initialise local storage: {e}. Please use Chrome / Edge, or check whether site data is blocked.",

      "param.size": "Samples",
      "param.medium": "Medium",
      "param.mem": "mem",
      "param.inj": "inj",
      "param.rec": "rec",
      "param.log": "log",
      "param.sample": "Sampling",
      "param.injMode": "Injection",
      "param.act": "Activation",
      "param.switch": "Flag",
      "param.date": "Date",
      "param.arch": "Network",
      "param.layer": "Layers",
      "param.node": "Nodes",
      "param.bs": "BatchSize",
      "param.lr": "LR",
      "param.epoch": "Epochs",
      "param.seed": "seed"
    }
  };

  var lang = "zh";

  function t(key, vars) {
    var s = (DICT[lang] && DICT[lang][key]);
    if (s === undefined) s = DICT.zh[key];
    if (s === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  }

  function getLang() { return lang; }

  function setLang(l) {
    lang = (l === "en") ? "en" : "zh";
    try { localStorage.setItem("fml_lang", lang); } catch (e) {}
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "zh-CN");
  }

  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem("fml_lang"); } catch (e) {}
    if (saved) { setLang(saved); return; }
    var nav = (navigator.language || navigator.userLanguage || "").toLowerCase();
    setLang(nav.indexOf("zh") === 0 ? "zh" : "en");
  }

  /** Refresh every piece of static text tagged with data-i18n */
  function applyStatic(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n]"), function (n) {
      n.textContent = t(n.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n-title]"), function (n) {
      n.title = t(n.getAttribute("data-i18n-title"));
    });
    var titleKey = document.body.getAttribute("data-i18n-doctitle");
    if (titleKey) document.title = t(titleKey);
  }

  global.I18N = { t: t, setLang: setLang, getLang: getLang, initLang: initLang, applyStatic: applyStatic };
})(window);
