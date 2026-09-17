/* 主逻辑：case / 输入数据 / 模型文件夹 / 图片对比 */
(function () {
  "use strict";

  var t = I18N.t;

  // 浏览器能直接显示的格式
  var IMAGE_EXT = /\.(png|apng|jpe?g|jfif|webp|avif|gif|bmp|ico|svgz?|pdf)$/i;
  var VECTOR_EXT = /\.(svgz?|pdf)$/i;
  // 是图，但浏览器渲染不了（MATLAB 常见输出），碰到要给出明确提示。
  // 注意不要把 .mat / .log 这类非图形文件放进来，否则提示会误导人。
  var UNVIEWABLE_EXT = /\.(fig|eps|ps|tiff?|emf|wmf|ai|psd)$/i;

  var SLOTS = [
    { key: "traj",  labelKey: "slot.traj", re: /(traj|轨迹|compare|contrast|pred|qoi)/i },
    { key: "error", labelKey: "slot.error", re: /(err|error|误差|hist|residual)/i },
    { key: "other", labelKey: "slot.other", re: null, multi: true }
  ];

  var project = null;
  var urlCache = {};      // blobId -> objectURL
  var lightboxList = [];
  var lightboxIndex = 0;
  var saveTimer = null;

  // 本地文件夹模式
  var dirHandle = null;
  var dirPerm = null;     // 'granted' | 'prompt' | 'denied' | null

  function folderReady() { return !!dirHandle && dirPerm === "granted"; }
  function dirLabel() { return (dirHandle && dirHandle.name) || t("storage.unnamedFolder"); }

  function caseOfModel(model) {
    for (var i = 0; i < project.cases.length; i++) {
      if (project.cases[i].models.indexOf(model) >= 0) return project.cases[i];
    }
    return activeCase();
  }

  /** 按当前模式落盘：本地文件夹 or 浏览器 IndexedDB */
  function saveImageBlob(caseObj, model, entry, blob) {
    if (folderReady()) {
      var unique = entry.slot === "other" ? entry.id.slice(-4) : "";
      var path = FMLDir.imagePath(caseObj.name, model.folderName, entry.slot, entry.name, unique);
      return FMLDir.writeFile(dirHandle, path, blob).then(function () {
        entry.path = path;
        delete entry.pending;
      });
    }
    delete entry.path;
    ensurePersist();   // 真的开始往浏览器里存东西了才申请持久化（不阻塞写入）
    return FMLStore.putBlob(entry.blobId, blob, { name: entry.name, mime: entry.mime });
  }

  /* 只在"往浏览器里存图"时申请一次持久化。
     不在启动时申请：Firefox 会弹权限框，一打开页面就弹很突兀；
     文件夹模式也不需要——图片本来就是磁盘文件。 */
  var persistTried = false;
  function ensurePersist() {
    if (persistTried) return;
    persistTried = true;
    FMLStore.persisted().then(function (already) {
      if (already) { persistedState = true; return; }
      return FMLStore.persist().then(function (ok) {
        persistedState = ok;
        updateStorageInfo();
      });
    }).catch(function () {});
  }

  function readImageBlob(entry) {
    if (entry.path) {
      if (!folderReady()) return Promise.resolve(null);
      return FMLDir.readFile(dirHandle, entry.path).catch(function () { return null; });
    }
    return FMLStore.getBlob(entry.blobId).then(function (rec) {
      return rec && rec.blob;
    }).catch(function () { return null; });
  }

  function removeImageBlob(entry) {
    if (entry.path) {
      return folderReady() ? FMLDir.deleteFile(dirHandle, entry.path) : Promise.resolve();
    }
    return FMLStore.deleteBlob(entry.blobId).catch(function () {});
  }

  // ---------------- 小工具 ----------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function fmtBytes(b) {
    if (b === null || b === undefined) return "";
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(1) + " GB";
  }
  /** 多选项确认框，返回被点中的 key（Esc / 点背景 = null） */
  function ask(title, body, choices) {
    return new Promise(function (resolve) {
      var box = $("askBox");
      $("askTitle").textContent = title;
      $("askBody").textContent = body;
      var acts = $("askActions");
      acts.innerHTML = "";

      function close(v) {
        box.hidden = true;
        document.removeEventListener("keydown", onKey);
        box.removeEventListener("click", onBackdrop);
        resolve(v);
      }
      function onKey(e) { if (e.key === "Escape") close(null); }
      function onBackdrop(e) { if (e.target === box) close(null); }

      choices.forEach(function (ch) {
        acts.appendChild(el("button", {
          class: "btn " + (ch.cls || ""), text: ch.label,
          onclick: function () { close(ch.key); }
        }));
      });
      document.addEventListener("keydown", onKey);
      box.addEventListener("click", onBackdrop);
      box.hidden = false;
    });
  }

  function banner(msg, isError) {
    var b = $("banner");
    b.textContent = msg;
    b.className = "banner" + (isError ? " error" : "");
    b.hidden = !msg;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      FMLStore.saveProject(project).then(function () {
        updateStorageInfo();
        // 文件夹模式下同时写一份清单，换电脑时靠它恢复
        if (folderReady()) {
          return FMLDir.writeJSON(dirHandle, {
            format: "fml-compare-project", version: 1,
            savedAt: new Date().toISOString(), project: stripRuntime(project)
          }).catch(function (e) { banner(t("msg.manifestFail", { e: e.message }), true); });
        }
      }).catch(function (e) {
        var msg = t("msg.saveFail", { e: errText(e) });
        if (/QuotaExceeded/i.test(errText(e))) msg += t("msg.hintQuota");
        banner(msg, true);
      });
    }, 200);
  }

  var persistedState = null;   // true / false / null(浏览器不支持)

  function updateStorageInfo() {
    FMLStore.estimate().then(function (est) {
      if (!est || !est.usage) return;
      var txt = est.quota
        ? t("storage.usage", { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) })
        : t("storage.used", { size: fmtBytes(est.usage) });
      // 只有"图片确实存在浏览器里"时才提醒可能被回收；文件夹模式下图片在磁盘上
      if (!folderReady() && persistedState === false) txt += t("storage.notPersisted");
      else if (!folderReady() && persistedState === true) txt += t("storage.isPersisted");
      $("storageInfo").textContent = txt;
    });
  }

  // ---------------- 状态存取 ----------------
  function activeCase() {
    if (!project.activeCaseId) return null;
    return project.cases.filter(function (c) { return c.id === project.activeCaseId; })[0] || null;
  }
  function findOrCreateCase(name) {
    var hit = project.cases.filter(function (c) { return c.name === name; })[0];
    if (hit) return hit;
    var c = { id: uid(), name: name || t("case.untitled"), inputs: [], models: [] };
    project.cases.push(c);
    return c;
  }

  // ---------------- 输入数据 ----------------
  function addInputFiles(fileList) {
    var touched = null;
    Array.prototype.forEach.call(fileList, function (f) {
      var parsed = FMLParser.parseName(f.name);
      var c = findOrCreateCase(caseNameFor(f.name));
      // 按去掉扩展名的名字比对：推导出来的那份没有扩展名，用户传的可能是 .mat/.h5/.npz
      var stem = FMLParser.stripExt(f.name);
      var dup = c.inputs.filter(function (i) { return FMLParser.stripExt(i.filename) === stem; })[0];
      if (!dup) {
        c.inputs.push({ id: uid(), filename: f.name, parsed: parsed });
      } else {
        delete dup.derived;      // 之前是推导出来的，现在真文件传上来了
        dup.filename = f.name;   // 用真实文件名（带上真正的扩展名）
        dup.parsed = parsed;
      }
      touched = c;
    });
    if (touched) project.activeCaseId = touched.id;
    reassignAll();          // 新输入数据可能让之前"未归类"的模型找到归属
    save(); render();
  }

  function paramChips(parsed, diffKeys, isModel) {
    var out = [];
    if (parsed.prefix) out.push(el("span", { class: "chip prefix", text: parsed.prefix }));
    parsed.params.forEach(function (p) {
      var cls = "chip";
      if (isModel && p.model) cls += " model-param";
      if (diffKeys && diffKeys[p.key]) cls += " diff";
      out.push(el("span", { class: cls }, [t("param." + p.key) + " ", el("b", { text: p.value })]));
    });
    parsed.flags.forEach(function (f) {
      out.push(el("span", { class: "chip flag", text: f }));
    });
    return out;
  }

  // ---------------- 模型文件夹（支持一次多个） ----------------
  /** 只当模型文件夹：输入数据靠参数去猜 */
  function addModelFolder(entries) { importFolders(entries, false); }

  /** 一步上传：文件夹名同时给出模型名和输入数据名（_L3N10 之前的部分） */
  function addResultFolder(entries) { importFolders(entries, true); }

  /** <input> 给的是扁平 File 列表，统一成 {file, path} */
  function toEntries(fileList) {
    return Array.prototype.slice.call(fileList).map(function (f) {
      return { file: f, path: f.webkitRelativePath || f.name };
    });
  }

  /** 名字里有 2 个以上非日期参数才像模型文件夹（"report_0909" 这种就不像） */
  function looksLikeModelName(name) {
    var p = FMLParser.parseName(name);
    return p.params.filter(function (x) { return x.key !== "date"; }).length >= 2;
  }

  /** prefix 是不是 name 的"整 token 前缀"（airfoil 是 airfoil_gp_rbf 的前缀） */
  function isTokenPrefix(prefix, name) {
    if (!prefix) return false;
    var a = FMLParser.stripExt(prefix).split("_").filter(Boolean);
    var b = FMLParser.stripExt(name).split("_").filter(Boolean);
    if (!a.length || a.length >= b.length) return false;
    return a.every(function (tok, i) { return b[i] === tok; });
  }

  /**
   * 决定一个文件夹/文件该归到哪个 case。
   * 名字符合已知命名规则 -> 沿用解析出的前缀（你自己的数据行为不变）。
   * 认不出来的命名 -> 前缀规则会把区分模型的部分整个吞掉、每个模型自成一个 case，
   * 所以改成：优先并入"名字正好是它 token 前缀"的已有 case，
   * 否则取本批里认不出的那些名字的公共前缀。
   */
  var NO_PREFIX_CASE = "default";   // 名字第一个 token 就是参数时用的 case 名（可双击改名）

  function caseNameFor(name) {
    if (looksLikeModelName(name)) {
      // 名字整个由参数组成（20k_heter_mem20_…）时前缀是空的。退回"第一个 token"
      // 会按样本量把 20k / 40k 拆成两个 case，而样本量本该是 case 内部的一个筛选项，
      // 所以这些统一落到同一个默认 case 里。
      return FMLParser.parseName(name).prefix || NO_PREFIX_CASE;
    }

    // 已有 case 的名字正好是它的 token 前缀 -> 并进去
    var hit = project.cases.filter(function (c) { return isTokenPrefix(c.name, name); })
      .sort(function (a, b) { return b.name.length - a.name.length; })[0];
    if (hit) return hit.name;

    // 否则按第一个 token 归组。故意不用"整批公共前缀"——那样结果会随这批里
    // 有哪些文件夹而变（单个导入和批量导入结果不一致）。第一个 token 稳定、
    // 与导入顺序无关；分多了可以用「合并 case…」并起来。
    var tokens = FMLParser.stripExt(name).split("_").filter(Boolean);
    return tokens[0] || name;
  }

  /** depth 层的目录里是不是直接躺着图片（depth = 这个目录本身占了几段路径） */
  function hasImagesAt(entries, depth) {
    return entries.some(function (en) {
      return en.path.split("/").length === depth + 1 && IMAGE_EXT.test(en.file.name);
    });
  }

  /** 按 depth 层切出子目录：{名字 -> entries}，保持出现顺序 */
  function subDirsOf(entries, depth) {
    var map = {}, order = [];
    entries.forEach(function (en) {
      var parts = en.path.split("/");
      if (parts.length <= depth + 1) return;      // 直接躺在这一层的文件，不是子目录
      if (!map[parts[depth]]) { map[parts[depth]] = []; order.push(parts[depth]); }
      map[parts[depth]].push(en);
    });
    return { map: map, order: order };
  }

  /**
   * 递归判定哪些目录是"结果文件夹"。
   *
   * 难点：<模型名>/figures/traj.png 和 report_0909/<模型名>/traj.png 结构一模一样，
   * 只能靠名字区分。规则：
   *   - 这一层直接躺着图片 -> 它就是模型（checkpoints/ logs/ 之类只当附属目录）
   *   - 子目录里有"像模型"的 -> 这一层只是容器，逐个下钻
   *     （父目录名本身像模型名时，子目录也必须像模型名才算 —— 否则 figures/ 会被
   *      当成模型，把真正的模型名丢掉）
   *   - 都不像但更深处还有图（runs/2026-09/<模型>/…）-> 继续往下找
   */
  function collectModelFolders(name, entries, depth, out) {
    var ownImages = hasImagesAt(entries, depth);
    var subs = subDirsOf(entries, depth);
    var parentIsModel = looksLikeModelName(name);

    var modelSubs = subs.order.filter(function (s) {
      return looksLikeModelName(s) || (!parentIsModel && hasImagesAt(subs.map[s], depth + 1));
    });

    if (modelSubs.length && !ownImages) {
      modelSubs.forEach(function (s) { collectModelFolders(s, subs.map[s], depth + 1, out); });
      return;
    }
    if (ownImages || !subs.order.length) {
      out.push({ folderName: name, entries: entries, depth: depth });
      return;
    }
    // 中间目录：自己没有图、子目录也不像模型，但更深处还有图，说明只是层级包装
    var deeperImages = entries.some(function (en) {
      return en.path.split("/").length > depth + 2 && IMAGE_EXT.test(en.file.name);
    });
    if (deeperImages) {
      subs.order.forEach(function (s) { collectModelFolders(s, subs.map[s], depth + 1, out); });
      return;
    }
    out.push({ folderName: name, entries: entries, depth: depth });
  }

  /** 把一堆 {file, path} 分成若干"模型文件夹" */
  function groupIntoModelFolders(entries) {
    var byTop = {}, order = [];
    entries.forEach(function (en) {
      var seg = en.path.split("/")[0];
      if (!byTop[seg]) { byTop[seg] = []; order.push(seg); }
      byTop[seg].push(en);
    });

    var out = [];
    order.forEach(function (seg) { collectModelFolders(seg, byTop[seg], 1, out); });
    return out;
  }

  /** 把异常整理成一句人能看懂的话（Chrome 的 DOMException.message 常常很含糊，得带上 name） */
  function errText(e) {
    if (!e) return "unknown error";
    var name = e.name ? e.name : "";
    var msg = e.message || String(e);
    return name && msg.indexOf(name) < 0 ? name + ": " + msg : msg;
  }

  function noteFailure(stats, what, e) {
    // 网页拿不到磁盘绝对路径，只能给相对路径长度（真实路径还要更长）
    stats.failures.push({ what: what, err: errText(e), pathLen: String(what).length });
    // 控制台留全量堆栈，界面只给摘要
    console.error("[fml] 处理失败:", what, e);
  }

  function importFolders(entries, deriveInput) {
    var groups = groupIntoModelFolders(entries);
    if (!groups.length) return;

    var stats = { folders: 0, images: 0, files: 0, last: null, lastInput: null,
                  failures: [], noImage: [] };
    banner(t("msg.reading"), false);

    // 单个文件夹/单张图失败不再让整批中断
    serialChain(groups.map(function (g) {
      return function () {
        return processFolder(g, deriveInput, stats).catch(function (e) {
          noteFailure(stats, g.folderName, e);
        });
      };
    })).then(function () {
      save(); render();
      if (stats.failures.length) {
        var f0 = stats.failures[0];
        var msg = t("msg.importPartial", {
          folders: stats.folders, images: stats.images, failed: stats.failures.length
        }) + " " + t("msg.itemFailed", { what: f0.what, e: f0.err });
        // 把两类最常见的失败翻译成"该怎么办"，而不是丢一个错误名给用户
        if (/QuotaExceeded/i.test(f0.err)) {
          msg += t("msg.hintQuota");
        } else if (/NotFoundError/.test(f0.err) && f0.pathLen) {
          msg += t("msg.hintLongPath", { len: f0.pathLen });
        }
        banner(msg, true);
      } else if (!stats.images && stats.noImage.length) {
        // 一张图都没进来：说清楚是格式不支持，还是里面本来就没图
        var d = stats.noImage[0];
        var list = (d.unviewable.length ? d.unviewable : d.names).slice(0, 4).join("、");
        if (d.names.length > 4) list += " …";
        banner(t(d.unviewable.length ? "msg.noImgUnviewable" : "msg.noImgFound",
          { name: d.folder, list: list }), true);
        console.warn("[fml] 没识别出图片，文件夹内容:", d.folder, d.names);
      } else if (groups.length > 1) {
        banner(stats.images
          ? t("msg.batchImported", { folders: stats.folders, images: stats.images })
          : t("msg.batchNoImg", { folders: stats.folders }), false);
      } else if (deriveInput) {
        banner(stats.images
          ? t("msg.resultImported", { name: stats.last, input: stats.lastInput, n: stats.images })
          : t("msg.resultNoImg", { name: stats.last, input: stats.lastInput }), false);
      } else {
        banner(stats.images
          ? t("msg.imported", { name: stats.last, n: stats.images, rest: stats.files - stats.images })
          : t("msg.importedNoImg", { name: stats.last, n: stats.files }), false);
      }
    }).catch(function (e) { banner(t("msg.importFail", { e: errText(e) }), true); });
  }

  function processFolder(group, deriveInput, stats) {
    var folderName = group.folderName;
    var parsed = FMLParser.parseName(folderName);
    var c = findOrCreateCase(caseNameFor(folderName));

    var structure = group.entries.map(function (en) {
      var rest = en.path.split("/").slice(group.depth).join("/");
      return { path: rest || en.file.name, size: en.file.size };
    });

    var model = {
      id: uid(), folderName: folderName, parsed: parsed,
      files: structure, images: [], treeOpen: false
    };
    var existing = c.models.filter(function (m) { return m.folderName === folderName; })[0];
    if (existing) {
      existing.files = structure;
      existing.parsed = parsed;
      model = existing;
    } else {
      c.models.push(model);
    }

    var inputName = null;
    if (deriveInput) {
      // 文件夹名直接给出了归属，不要再被自动归类改掉
      var inp = ensureDerivedInput(c, model);
      inputName = inp.filename;
      model.inputId = inp.id;
      model.inputPinned = true;
    } else {
      autoAssignInput(c, model);
    }
    project.activeCaseId = c.id;

    // 只把文件夹里的图片读出来存起来，其他文件一律不读内容
    var images = group.entries.filter(function (en) { return IMAGE_EXT.test(en.file.name); });
    stats.folders++;
    stats.files += group.entries.length;
    stats.last = folderName;
    stats.lastInput = inputName;

    // 一张图都没识别出来时，记下里面到底有什么，好让提示条说清楚原因
    if (!images.length && group.entries.length) {
      var names = group.entries.map(function (en) { return en.file.name; });
      stats.noImage.push({
        folder: folderName,
        names: names,
        unviewable: names.filter(function (n) { return UNVIEWABLE_EXT.test(n); })
      });
    }

    return serialChain(images.map(function (en) {
      return function () {
        return storeImage(model, classify(en.file.name, folderName), en.file)
          .then(function () { stats.images++; })
          .catch(function (e) { noteFailure(stats, en.path, e); });
      };
    }));
  }

  /**
   * 判断一张图属于哪个槽位。
   *
   * 坑：文件名常常是「<模型文件夹名>_traj.png」，而模型名里随便一个 token 就可能
   * 撞上槽位关键词（randiSameNumPerTraj 含 Traj、..._pred_... 含 pred），
   * 拿整个文件名去匹配的话 _error.png 会先命中轨迹图规则，然后两张图挤进同一个槽位，
   * 互相把对方删掉。所以只看"真正用于区分的那一小段"：
   *   1. 去掉和文件夹名重复的前缀
   *   2. 还是匹配不上，就把文件夹名里出现过的 token 逐个从文件名里删掉再看
   * 绝不拿原始文件名兜底 —— 那正是误判的来源。
   */
  function classify(filename, folderName) {
    var base = String(filename).replace(/\.[a-z0-9]{1,6}$/i, "");
    var tail = (folderName && base.indexOf(folderName) === 0)
      ? base.slice(folderName.length) : base;

    var cleaned = base;
    if (folderName) {
      folderName.split(/[_\-.\s]+/)
        .filter(function (tok) { return tok.length >= 2; })
        .sort(function (a, b) { return b.length - a.length; })   // 先删长的，免得剩下子串
        .forEach(function (tok) { cleaned = cleaned.split(tok).join(" "); });
    }

    var candidates = [tail, cleaned];
    for (var ci = 0; ci < candidates.length; ci++) {
      if (!candidates[ci]) continue;
      for (var i = 0; i < SLOTS.length; i++) {
        if (SLOTS[i].re && SLOTS[i].re.test(candidates[ci])) return SLOTS[i].key;
      }
    }
    return "other";
  }

  function storeImage(model, slotKey, file) {
    var slotDef = SLOTS.filter(function (s) { return s.key === slotKey; })[0] || SLOTS[2];
    var entry = {
      id: uid(), slot: slotKey, name: file.name,
      mime: file.type || guessMime(file.name), blobId: uid()
    };
    var caseObj = caseOfModel(model);
    return saveImageBlob(caseObj, model, entry, file).then(function () {
      if (!slotDef.multi) {
        // 单图槽：替换旧的。
        // 坑：文件夹模式下路径只由 <case>/<模型>/<槽位>.<扩展名> 决定，和具体是哪张图无关，
        // 所以刚写下去的新图和被替换的旧图很可能是同一个文件 —— 这时再去删"旧的"
        // 等于把刚写好的新图一起删掉（重新拖一次训练结果就会触发）。
        // 覆盖写本身已经完成了替换，路径相同就只清掉内存里的引用。
        model.images.filter(function (im) { return im.slot === slotKey; }).forEach(function (im) {
          if (!(im.path && entry.path && im.path === entry.path)) removeImageBlob(im);
          releaseUrl(im.blobId);
        });
        model.images = model.images.filter(function (im) { return im.slot !== slotKey; });
      }
      model.images.push(entry);
    });
  }

  function guessMime(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    var map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
      gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", pdf: "application/pdf" };
    return map[ext] || "application/octet-stream";
  }

  function releaseUrl(blobId) {
    if (urlCache[blobId]) { URL.revokeObjectURL(urlCache[blobId]); delete urlCache[blobId]; }
  }

  // ---------------- 输入数据 <- 模型 归属关系 ----------------
  function inputOf(c, model) {
    if (!model.inputId) return null;
    return c.inputs.filter(function (i) { return i.id === model.inputId; })[0] || null;
  }

  /** 按模型名推导出它自己那份输入数据（没有就建一个，标记为"推导"） */
  function ensureDerivedInput(c, model) {
    // 文件夹名整个都是超参数时 dataset 会是空的，那就退回用完整文件夹名。
    // 不再硬加 ".mat"：别人可能用 .h5 / .npz / .pkl，真文件传进来时按 stem 对上就行。
    var split = FMLParser.splitModelName(model.folderName);
    var name = split.dataset || FMLParser.stripExt(model.folderName);
    var inp = c.inputs.filter(function (i) { return FMLParser.stripExt(i.filename) === name; })[0];
    if (!inp) {
      inp = {
        id: uid(), filename: name,
        parsed: FMLParser.parseName(name),
        derived: true               // 还没上传过真正的 .mat
      };
      c.inputs.push(inp);
    }
    return inp;
  }

  /**
   * 给模型找它的输入数据。
   * mem / inj / rec / 采样 … 每一个都是自变量，所以"差一个参数"就是**另一份数据**，
   * 不能挂到最接近的那份上（那样只会造出一堆假的"参数不一致"告警）。
   * 因此：签名完全一致才认；否则按模型名推导出它自己的那份。
   */
  function autoAssignInput(c, model) {
    if (model.inputPinned) return;

    // 签名为空 = 名字里一个数据参数都没认出来。这时"签名相同"并不代表"同一份数据"：
    // airfoil_meshA / airfoil_meshB 的签名都是空的，按空签名匹配只会挂到碰巧排在
    // 第一个的那份上，而且因为差异列表也是空的，连告警都不会有。只能按名字推导。
    var sig = FMLParser.datasetSignature(model.parsed);
    if (sig) {
      var exact = c.inputs.filter(function (i) {
        return FMLParser.datasetSignature(i.parsed) === sig;
      });
      if (exact.length) {
        // 日期不参与签名（文件夹日期常和数据日期差一两天），但同日期的优先
        var sameDate = exact.filter(function (i) {
          return i.parsed.byKey.date === model.parsed.byKey.date;
        });
        model.inputId = (sameDate[0] || exact[0]).id;
        return;
      }
    }
    model.inputId = ensureDerivedInput(c, model).id;
  }

  /** 输入数据有增删后重新归类（手动指定过的保持不动，除非目标没了） */
  function reassignAll() {
    project.cases.forEach(function (c) {
      (c.models || []).forEach(function (m) {
        if (m.inputPinned && m.inputId && !inputOf(c, m)) m.inputPinned = false;
        if (!m.inputPinned) autoAssignInput(c, m);
      });
    });
  }

  /* 每份输入数据一套底色，让"这些模型属于同一个 .mat"一眼可见。
     用 rgba 叠在卡片底色上，浅色/深色两套主题都能用。 */
  var GROUP_TINTS = [
    { edge: "#2a6fd6", head: "rgba(42,111,214,.10)", card: "rgba(42,111,214,.045)" },
    { edge: "#12968c", head: "rgba(18,150,140,.11)", card: "rgba(18,150,140,.05)"  },
    { edge: "#c0820f", head: "rgba(192,130,15,.13)", card: "rgba(192,130,15,.06)"  },
    { edge: "#7c5cdc", head: "rgba(124,92,220,.11)", card: "rgba(124,92,220,.05)"  },
    { edge: "#d2456e", head: "rgba(210,69,110,.10)", card: "rgba(210,69,110,.045)" },
    { edge: "#3f9a4a", head: "rgba(63,154,74,.12)",  card: "rgba(63,154,74,.055)" }
  ];

  function tintOfInput(c, inp) {
    if (!inp) return null;
    var i = c.inputs.indexOf(inp);
    return i < 0 ? null : GROUP_TINTS[i % GROUP_TINTS.length];
  }

  /* ---- 星标：每份输入数据下只留一个"最好"的模型 ---- */
  function toggleStar(c, model) {
    var was = !!model.starred;
    c.models.forEach(function (m) {
      if (m.inputId === model.inputId) delete m.starred;
    });
    if (!was) model.starred = true;
    save(); render();
  }

  function starButton(c, m) {
    return el("button", {
      class: "star-btn" + (m.starred ? " on" : ""),
      title: m.starred ? t("star.remove") : t("star.set"),
      text: m.starred ? "★" : "☆",
      onclick: function (e) { e.stopPropagation(); toggleStar(c, m); }
    });
  }

  function starredOf(c, inp) {
    if (!inp) return null;
    return c.models.filter(function (m) {
      return m.inputId === inp.id && m.starred;
    })[0] || null;
  }

  /** 输入数据的短名：去掉和 case 名重复的前缀 */
  function inputShort(inp) {
    var raw = inp.filename.replace(/\.(mat|zip|tar|gz)$/i, "");
    var p = inp.parsed.prefix;
    return (raw.indexOf(p) === 0 ? raw.slice(p.length).replace(/^_/, "") : raw) || raw;
  }

  function renderDataTree(c) {
    var wrap = $("dataTree");
    wrap.innerHTML = "";

    if (!c.inputs.length && !c.models.length) {
      wrap.appendChild(el("div", { class: "hint", text: t("empty.noData") }));
      return;
    }

    c.inputs.forEach(function (inp) {
      wrap.appendChild(dataGroup(c, inp,
        c.models.filter(function (m) { return m.inputId === inp.id; })));
    });

    var loose = c.models.filter(function (m) { return !inputOf(c, m); });
    if (loose.length) wrap.appendChild(dataGroup(c, null, loose));
  }

  /**
   * 删掉一份输入数据。
   * alsoModels = true  -> 它下面的模型和图片一起删
   * alsoModels = false -> 模型保留，标成"用户指定的未归类"
   *   （必须打上 pinned，否则自动归类会立刻按模型名把这份数据重新推导出来，等于删不掉）
   */
  function removeInput(c, inp, alsoModels) {
    var affected = c.models.filter(function (m) { return m.inputId === inp.id; });
    c.inputs = c.inputs.filter(function (x) { return x.id !== inp.id; });

    if (alsoModels) {
      var dead = {};
      affected.forEach(function (m) {
        dead[m.id] = 1;
        m.images.forEach(function (im) { removeImageBlob(im); releaseUrl(im.blobId); });
      });
      c.models = c.models.filter(function (m) { return !dead[m.id]; });
    } else {
      affected.forEach(function (m) { m.inputId = null; m.inputPinned = true; });
    }
    reassignAll(); save(); render();
  }

  function dataGroup(c, inp, models) {
    var box = el("div", { class: "data-group" + (inp ? "" : " unassigned") });
    var tint = tintOfInput(c, inp);
    if (tint) {
      box.style.setProperty("--g-edge", tint.edge);
      box.style.setProperty("--g-head", tint.head);
      box.style.setProperty("--g-card", tint.card);
    }
    var head = el("div", { class: "data-group-head" });

    if (inp) {
      head.appendChild(el("div", { class: "data-group-title" }, [
        el("div", { class: "data-group-name mono", text: inp.filename }),
        inp.derived ? el("span", {
          class: "chip derived", text: t("input.derived"), title: t("input.derivedTitle")
        }) : null,
        el("span", { class: "data-group-count", text: t("group.modelCount", { n: models.length }) }),
        el("button", {
          class: "btn btn-sm btn-danger", text: t("common.delete"),
          onclick: function () {
            if (!models.length) {
              if (confirm(t("confirm.deleteInputEmpty", { name: inp.filename }))) removeInput(c, inp, false);
              return;
            }
            // 下面挂着模型 -> 让用户选：一起删，还是留成未归类
            ask(t("ask.deleteInput.title"),
                t("ask.deleteInput.body", { name: inp.filename, n: models.length }), [
              { key: "cancel", label: t("ask.cancel") },
              { key: "keep",   label: t("ask.keepModels") },
              { key: "all",    label: t("ask.deleteModels", { n: models.length }), cls: "btn-danger" }
            ]).then(function (choice) {
              if (choice === "keep" || choice === "all") removeInput(c, inp, choice === "all");
            });
          }
        })
      ]));
      // 这份数据下被标为"最好"的模型，直接在表头列出来
      var best = starredOf(c, inp);
      var chips = paramChips(inp.parsed, null, false);
      if (best) {
        computeLabels(c);
        chips.unshift(el("span", { class: "chip star", title: best.folderName },
          ["★ " + t("star.badge") + " ", el("b", { text: displayName(best) })]));
      }
      head.appendChild(el("div", { class: "chip-row", style: "margin-top:7px" }, chips));
    } else {
      head.appendChild(el("div", { class: "data-group-title" }, [
        el("div", { class: "data-group-name", text: t("group.unassigned") }),
        el("span", { class: "data-group-count", text: t("group.modelCount", { n: models.length }) })
      ]));
      head.appendChild(el("div", { class: "hint", style: "margin-top:5px", text: t("group.unassignedHint") }));
    }
    box.appendChild(head);

    var body = el("div", { class: "data-group-body" });
    if (!models.length) {
      body.appendChild(el("div", { class: "group-empty", text: t("group.noModels") }));
    } else {
      models.forEach(function (m) { body.appendChild(modelCard(c, m, inp)); });
    }
    box.appendChild(body);
    return box;
  }

  function modelCard(c, m, ref) {
    var diffs = ref ? FMLParser.diffParams(m.parsed, ref.parsed) : [];
    var diffKeys = {};
    diffs.forEach(function (d) { diffKeys[d.key] = 1; });

    var card = el("div", { class: "model-card" + (m.starred ? " starred" : "") });

    card.appendChild(el("div", { class: "model-card-head" }, [
      el("button", {
        class: "caret-btn", title: t("model.toggleImages"),
        text: m.imagesCollapsed ? "▸" : "▾",
        onclick: function () { m.imagesCollapsed = !m.imagesCollapsed; save(); render(); }
      }),
      starButton(c, m),
      el("div", { class: "model-title mono", text: m.folderName }),
      el("div", { class: "model-actions" }, [
        inputSelect(c, m),
        el("button", {
          class: "btn btn-sm btn-danger", text: t("common.delete"),
          onclick: function () {
            if (!confirm(t("confirm.deleteModel", { name: m.folderName }))) return;
            m.images.forEach(function (im) { removeImageBlob(im); releaseUrl(im.blobId); });
            c.models = c.models.filter(function (x) { return x.id !== m.id; });
            save(); render();
          }
        })
      ])
    ]));

    card.appendChild(el("div", { class: "chip-row" }, paramChips(m.parsed, diffKeys, true)));

    if (diffs.length) {
      card.appendChild(el("div", { class: "diff-note" }, [
        el("span", { text: t("model.diff", { name: ref.filename }) })
      ].concat(diffs.map(function (d) {
        return el("span", { class: "chip diff" }, [
          t("param." + d.key) + " ", el("b", { text: (d.modelValue || "—") }), " ↔ " + (d.inputValue || "—")
        ]);
      }))));
    }

    if (m.files && m.files.length) {
      card.appendChild(el("span", {
        class: "tree-toggle",
        text: (m.treeOpen ? "▾ " : "▸ ") + t("model.tree", { n: m.files.length }),
        onclick: function () { m.treeOpen = !m.treeOpen; save(); render(); }
      }));
      if (m.treeOpen) card.appendChild(el("div", { class: "tree", text: treeText(m.files) }));
    }

    if (m.imagesCollapsed) {
      card.appendChild(el("div", {
        class: "slots-collapsed",
        text: m.images.length ? t("model.imagesCollapsed", { n: m.images.length }) : t("model.noImagesYet"),
        onclick: function () { m.imagesCollapsed = false; save(); render(); }
      }));
    } else {
      card.appendChild(renderSlots(m));
    }
    return card;
  }

  /** 一键折叠 / 展开当前 case 下所有模型的图片 */
  function setAllCollapsed(collapsed) {
    var c = activeCase();
    if (!c) return;
    c.models.forEach(function (m) { m.imagesCollapsed = collapsed; });
    save(); render();
  }

  /** 一个下拉搞定：换输入数据 + 跨 case 移动 */
  function inputSelect(curCase, model) {
    var curVal = curCase.id + "|" + (model.inputId || "");
    var sel = el("select", {
      class: "assign-select", title: t("assign.title"),
      onchange: function () {
        var parts = sel.value.split("|");
        var target = project.cases.filter(function (x) { return x.id === parts[0]; })[0];
        if (!target) return;
        if (target.id !== curCase.id) {
          curCase.models = curCase.models.filter(function (x) { return x.id !== model.id; });
          target.models.push(model);
          project.activeCaseId = target.id;
        }
        model.inputId = parts[1] || null;
        model.inputPinned = true;
        save(); render();
      }
    });

    project.cases.forEach(function (c2) {
      var g = el("optgroup", { label: c2.name });
      c2.inputs.forEach(function (i) {
        var v = c2.id + "|" + i.id;
        g.appendChild(el("option", { value: v, text: inputShort(i), title: i.filename, selected: v === curVal }));
      });
      var none = c2.id + "|";
      g.appendChild(el("option", { value: none, text: t("assign.none"), selected: none === curVal }));
      sel.appendChild(g);
    });
    return sel;
  }

  function treeText(files) {
    var lines = [];
    var shown = files.slice(0, 300);
    shown.forEach(function (f) {
      var depth = f.path.split("/").length - 1;
      lines.push(new Array(depth + 1).join("    ") + f.path.split("/").pop() +
        (f.size ? "   (" + fmtBytes(f.size) + ")" : ""));
    });
    if (files.length > shown.length) lines.push(t("model.treeMore", { n: files.length - shown.length }));
    return lines.join("\n");
  }

  function renderSlots(m) {
    var wrap = el("div", { class: "slots" });

    SLOTS.forEach(function (sd) {
      var imgs = m.images.filter(function (im) { return im.slot === sd.key; });

      if (sd.multi) {
        imgs.forEach(function (im) { wrap.appendChild(slotBox(m, sd, im)); });
        wrap.appendChild(slotBox(m, sd, null));   // 追加位
      } else {
        wrap.appendChild(slotBox(m, sd, imgs[0] || null));
      }
    });
    return wrap;
  }

  /* 手动往图片槽里传图也会失败（浏览器配额满、文件夹权限被收回、Windows 路径超长）。
     没有这个 catch 的话文件框一关就什么都没发生，连提示都没有 —— 而配额和长路径
     这两种最常见的失败，提示文案其实早就写好了，只是导入流程独占着。 */
  function slotUpload(m, slotKey, file) {
    storeImage(m, slotKey, file).then(function () {
      save(); render();
    }).catch(function (e) {
      var err = errText(e);
      var msg = t("msg.itemFailed", { what: file.name, e: err });
      if (/QuotaExceeded/i.test(err)) msg += t("msg.hintQuota");
      banner(msg, true);
      console.error("[fml] 图片保存失败:", file.name, e);
    });
  }

  function slotBox(m, slotDef, image) {
    var input = el("input", {
      type: "file", accept: "image/*,.pdf,.svg", hidden: true,
      onchange: function () {
        if (input.files && input.files[0]) slotUpload(m, slotDef.key, input.files[0]);
        input.value = "";        // 不清空的话再选同一个文件不会触发 change
      }
    });

    var box = el("div", { class: "slot" + (image ? " filled" : "") }, [input]);

    box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", function () { box.classList.remove("over"); });
    box.addEventListener("drop", function (e) {
      e.preventDefault(); box.classList.remove("over");
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) slotUpload(m, slotDef.key, f);
    });

    box.appendChild(el("div", { class: "slot-head" }, [
      el("span", { class: "slot-label", text: t(slotDef.labelKey) }),
      image
        ? el("button", {
            class: "btn btn-sm btn-danger", text: "✕",
            onclick: function () {
              removeImageBlob(image); releaseUrl(image.blobId);
              m.images = m.images.filter(function (x) { return x.id !== image.id; });
              save(); render();
            }
          })
        : null
    ]));

    if (image) {
      // 在这个模型自己的图片之间翻页。不能用 collectImages()：那是对比区筛过的列表，
      // 数据树里的缩略图却是全量渲染的，取消勾选的模型一点就会翻到别人的图上去。
      box.appendChild(mediaNode(image, "slot-thumb", function () {
        openLightbox(modelImages(m), image.id);
      }));
      box.appendChild(el("div", { class: "slot-file", text: image.name }));
    } else {
      box.appendChild(el("div", {
        class: "slot-empty",
        text: slotDef.multi ? t("slot.add") : t("slot.click"),
        onclick: function () { input.click(); }
      }));
    }
    return box;
  }

  /** 按类型生成 <img> 或 <embed>（pdf） */
  function mediaNode(image, cls, onClick) {
    var url = urlCache[image.blobId];
    if (!url) {
      return el("div", { class: "cmp-missing",
        text: (image.path && !folderReady()) ? t("img.needAccess") : t("img.failed") });
    }
    if (/pdf/i.test(image.mime) || /\.pdf$/i.test(image.name)) {
      var holder = el("div", { class: cls, style: "cursor:zoom-in;overflow:hidden;height:150px", onclick: onClick },
        [el("embed", { src: url, type: "application/pdf", style: "width:100%;height:100%;pointer-events:none" })]);
      return holder;
    }
    return el("img", { class: cls, src: url, alt: image.name, loading: "lazy", onclick: onClick });
  }

  // ---------------- 对比区 ----------------
  // ---------------- 参数筛选 ----------------
  var FILTER_KEYS = ["size", "mem", "inj", "rec", "log", "sample"];

  /** 取模型的某个参数值；模型名里没有就退回它挂靠的输入数据 */
  function paramValueOf(c, m, key) {
    var v = m.parsed.byKey[key];
    if (v !== undefined) return v;
    var inp = inputOf(c, m);
    return inp ? inp.parsed.byKey[key] : undefined;
  }

  /** 当前 case 里每个参数有哪些取值（只保留取值多于一个的，否则筛了也没意义） */
  function filterableParams(c) {
    var out = [];
    FILTER_KEYS.forEach(function (key) {
      var vals = [];
      c.models.forEach(function (m) {
        var v = paramValueOf(c, m, key);
        if (v !== undefined && vals.indexOf(v) < 0) vals.push(v);
      });
      if (vals.length > 1) {
        vals.sort(function (a, b) {
          var na = parseFloat(a), nb = parseFloat(b);
          if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
          return String(a).localeCompare(String(b));
        });
        out.push({ key: key, values: vals });
      }
    });
    return out;
  }

  /** 没设置过的参数默认全选 */
  function filterState(c) {
    if (!c._filters) c._filters = {};
    filterableParams(c).forEach(function (p) {
      if (!c._filters[p.key]) {
        c._filters[p.key] = {};
        p.values.forEach(function (v) { c._filters[p.key][v] = true; });
      } else {
        // 新出现的取值默认也选上
        p.values.forEach(function (v) {
          if (c._filters[p.key][v] === undefined) c._filters[p.key][v] = true;
        });
      }
    });
    return c._filters;
  }

  function modelPassesFilter(c, m) {
    var f = c._filters || {};
    var params = filterableParams(c);
    for (var i = 0; i < params.length; i++) {
      var key = params[i].key;
      if (!f[key]) continue;
      var v = paramValueOf(c, m, key);
      if (v === undefined) continue;          // 没这个参数的模型不被筛掉
      if (!f[key][v]) return false;
    }
    return true;
  }

  /* ---- 图片类型筛选：只看轨迹图 / 只看误差图 / 都看 ---- */
  function slotTypesPresent(c) {
    return SLOTS.filter(function (sd) {
      return c.models.some(function (m) {
        return m.images.some(function (im) { return im.slot === sd.key; });
      });
    });
  }

  function slotState(c) {
    if (!c._slots) c._slots = {};
    SLOTS.forEach(function (sd) {
      if (c._slots[sd.key] === undefined) c._slots[sd.key] = true;
    });
    return c._slots;
  }

  function slotOn(c, key) { return !!slotState(c)[key]; }

  function renderParamFilter(c) {
    var wrap = $("cmpParamFilter");
    wrap.innerHTML = "";
    var params = filterableParams(c);
    var types = slotTypesPresent(c);
    var showTypes = types.length > 1;          // 只有一种图时筛了也没意义
    if (!params.length && !showTypes) return;
    filterState(c);
    slotState(c);

    wrap.appendChild(el("span", { class: "param-filter-head", text: t("cmp.paramFilter") }));

    if (showTypes) {
      var titem = el("div", { class: "param-item" }, [
        el("span", { class: "param-item-label", text: t("cmp.plotType") })
      ]);
      var allTypes = types.every(function (sd) { return c._slots[sd.key]; });
      titem.appendChild(el("span", {
        class: "chip toggle all" + (allTypes ? " on" : ""), text: t("cmp.all"),
        onclick: function () {
          types.forEach(function (sd) { c._slots[sd.key] = true; });
          refreshCompare(c);
        }
      }));
      types.forEach(function (sd) {
        titem.appendChild(el("span", {
          class: "chip toggle" + (c._slots[sd.key] ? " on" : ""), text: t(sd.labelKey),
          onclick: function () {
            c._slots[sd.key] = !c._slots[sd.key];
            refreshCompare(c);
          }
        }));
      });
      wrap.appendChild(titem);
    }

    params.forEach(function (p) {
      var item = el("div", { class: "param-item" }, [
        el("span", { class: "param-item-label", text: t("param." + p.key) })
      ]);
      var allOn = p.values.every(function (v) { return c._filters[p.key][v]; });
      item.appendChild(el("span", {
        class: "chip toggle all" + (allOn ? " on" : ""), text: t("cmp.all"),
        onclick: function () {
          p.values.forEach(function (v) { c._filters[p.key][v] = true; });
          refreshCompare(c);
        }
      }));
      p.values.forEach(function (v) {
        item.appendChild(el("span", {
          class: "chip toggle" + (c._filters[p.key][v] ? " on" : ""), text: v,
          onclick: function () {
            c._filters[p.key][v] = !c._filters[p.key][v];
            refreshCompare(c);
          }
        }));
      });
      wrap.appendChild(item);
    });

    wrap.appendChild(el("button", {
      class: "link-btn", text: t("cmp.reset"),
      onclick: function () {
        c._filters = {}; c._slots = null;
        filterState(c); slotState(c); refreshCompare(c);
      }
    }));
  }

  function refreshCompare(c) {
    renderParamFilter(c);
    renderCompareFilter(c);
    renderCompare(c);
    save();
  }

  function selectedModelIds(c) {
    if (!c._selected) c._selected = {};
    // 后加入的模型默认也勾上
    c.models.forEach(function (m) {
      if (c._selected[m.id] === undefined) c._selected[m.id] = true;
    });
    return c.models.filter(function (m) {
      return c._selected[m.id] && modelPassesFilter(c, m);
    });
  }

  function renderCompareFilter(c) {
    computeLabels(c);
    var wrap = $("cmpFilter");
    wrap.innerHTML = "";
    if (!c.models.length) return;
    selectedModelIds(c);

    // 勾选框也按输入数据分组，一眼看出哪些模型是同一份数据训出来的；被参数筛掉的不列出来
    var visible = c.models.filter(function (m) { return modelPassesFilter(c, m); });
    var groups = [];
    c.inputs.forEach(function (i) {
      var ms = visible.filter(function (m) { return m.inputId === i.id; });
      if (ms.length) groups.push({ label: inputShort(i), title: i.filename, models: ms, tint: tintOfInput(c, i) });
    });
    var loose = visible.filter(function (m) { return !inputOf(c, m); });
    if (loose.length) groups.push({ label: t("group.unassigned"), title: "", models: loose, tint: null });

    groups.forEach(function (g) {
      // 小圆点用和上面分组一样的底色，两个区域对得上
      var block = el("div", { class: "cmp-filter-group" }, [
        el("div", { class: "cmp-filter-label", title: g.title }, [
          el("span", { class: "g-dot", style: "background:" + (g.tint ? g.tint.edge : "var(--ink-3)") }),
          g.label
        ])
      ]);
      var chips = el("div", { class: "chip-row" });
      g.models.forEach(function (m) {
        var cb = el("input", {
          type: "checkbox", checked: !!c._selected[m.id],
          onchange: function () { c._selected[m.id] = cb.checked; renderCompare(c); }
        });
        chips.appendChild(el("label", {
          class: "chip chip-select" + (m.starred ? " star" : ""), title: m.folderName
        }, [cb, (m.starred ? "★ " : "") + displayName(m)]));
      });
      block.appendChild(chips);
      wrap.appendChild(block);
    });
  }

  /** 模型显示名：去掉和 case 名重复的前缀，只留后面区分度高的部分 */
  function shortName(m) {
    var raw = m.folderName;
    var pfx = m.parsed.prefix;
    var rest = raw.indexOf(pfx) === 0 ? raw.slice(pfx.length).replace(/^_/, "") : raw;
    var tail = m.parsed.params.filter(function (p) { return p.model; })
      .map(function (p) { return p.value; }).concat(m.parsed.flags);
    return tail.length ? tail.join(" · ") : (rest || raw);
  }

  /* 只按超参数命名时，"Layer3 Node10" 可能好几个模型都一样（它们差在数据参数上）。
     这里给重名的补上真正有区别的那几个参数。 */
  var labelMap = {};

  function computeLabels(c) {
    labelMap = {};
    var base = {};
    c.models.forEach(function (m) { base[m.id] = shortName(m); });

    var byLabel = {};
    c.models.forEach(function (m) {
      (byLabel[base[m.id]] = byLabel[base[m.id]] || []).push(m);
    });

    c.models.forEach(function (m) {
      var peers = byLabel[base[m.id]];
      if (peers.length < 2) { labelMap[m.id] = base[m.id]; return; }

      // 贪心地只挑"能把它和同名模型区分开"的最少几个参数，避免标签写成一长串
      var extra = [];
      var remaining = peers;
      FILTER_KEYS.concat(["injMode", "medium"]).forEach(function (k) {
        if (remaining.length < 2) return;
        var v = paramValueOf(c, m, k);
        if (v === undefined) return;
        var narrowed = remaining.filter(function (p) { return paramValueOf(c, p, k) === v; });
        if (narrowed.length < remaining.length) {
          extra.push(t("param." + k) + " " + v);
          remaining = narrowed;
        }
      });
      if (!extra.length) {
        var d = m.parsed.byKey.date;
        if (d && peers.some(function (p) { return p.parsed.byKey.date !== d; })) extra.push(d);
      }
      labelMap[m.id] = base[m.id] + (extra.length ? "（" + extra.join(", ") + "）" : "");
    });
  }

  function displayName(m) { return labelMap[m.id] || shortName(m); }

  function collectImages() {
    var c = activeCase();
    if (!c) return [];
    var out = [];
    selectedModelIds(c).forEach(function (m) {
      SLOTS.forEach(function (sd) {
        if (!slotOn(c, sd.key)) return;
        m.images.filter(function (im) { return im.slot === sd.key; }).forEach(function (im) {
          out.push({ image: im, model: m, slot: sd });
        });
      });
    });
    return out;
  }

  function renderCompare(c) {
    var area = $("cmpArea");
    area.innerHTML = "";
    var models = selectedModelIds(c);
    if (!models.length) {
      var anyPass = c.models.some(function (m) { return modelPassesFilter(c, m); });
      area.appendChild(el("div", { class: "empty-state",
        text: (c.models.length && !anyPass) ? t("cmp.noneMatch") : t("empty.selectModel") }));
      return;
    }

    var layout = $("cmpLayout").value;
    var cols = parseInt($("cmpCols").value, 10);
    var all = collectImages();

    function gridStyle(n) {
      var k = cols || Math.min(Math.max(n, 1), 3);
      return "grid-template-columns: repeat(" + k + ", minmax(0, 1fr));";
    }

    if (layout === "byKind") {
      SLOTS.forEach(function (sd) {
        if (!slotOn(c, sd.key)) return;
        var cells = models.map(function (m) {
          var imgs = m.images.filter(function (im) { return im.slot === sd.key; });
          return { model: m, images: imgs };
        });
        if (!cells.some(function (x) { return x.images.length; })) return;

        var grid = el("div", { class: "cmp-grid", style: gridStyle(models.length) });
        cells.forEach(function (cell) {
          var body = cell.images.length
            ? cell.images.map(function (im) {
                return mediaNode(im, "cmp-img", function () { openLightbox(all, im.id); });
              })
            : [el("div", { class: "cmp-missing", text: t("empty.noThisImage") })];
          grid.appendChild(el("div", { class: "cmp-cell" },
            [el("div", { class: "cmp-cell-title" }, [
              starButton(c, cell.model), displayName(cell.model)
            ])].concat(body)));
        });
        area.appendChild(el("div", { class: "cmp-group" }, [
          el("div", { class: "cmp-group-title", text: t(sd.labelKey) }), grid
        ]));
      });
    } else {
      models.forEach(function (m) {
        var imgs = [];
        SLOTS.forEach(function (sd) {
          if (!slotOn(c, sd.key)) return;
          m.images.filter(function (im) { return im.slot === sd.key; }).forEach(function (im) {
            imgs.push({ im: im, sd: sd });
          });
        });
        var grid = el("div", { class: "cmp-grid", style: gridStyle(Math.max(imgs.length, 1)) });
        if (!imgs.length) {
          grid.appendChild(el("div", { class: "cmp-missing", text: t("empty.noImage") }));
        }
        imgs.forEach(function (x) {
          grid.appendChild(el("div", { class: "cmp-cell" }, [
            el("div", { class: "cmp-cell-title", text: t(x.sd.labelKey) }),
            mediaNode(x.im, "cmp-img", function () { openLightbox(all, x.im.id); })
          ]));
        });
        area.appendChild(el("div", { class: "cmp-group" }, [
          el("div", { class: "cmp-group-title" }, [
            starButton(c, m), el("span", { class: "mono", text: m.folderName })
          ]), grid
        ]));
      });
    }

    // 别留一片空白；区分"模型被筛没了"和"图片类型全关了"
    // 只看实际存在的类型 —— "其他"默认开着但可能一张图都没有
    if (!area.children.length) {
      var present = slotTypesPresent(c);
      var anySlot = !present.length || present.some(function (sd) { return slotOn(c, sd.key); });
      area.appendChild(el("div", { class: "empty-state",
        text: anySlot ? t("cmp.noneMatch") : t("cmp.noPlotType") }));
    }
  }

  // ---------------- lightbox ----------------
  /** 某个模型自己的全部图片（按槽位顺序），用于数据树里的缩略图翻页 */
  function modelImages(m) {
    var out = [];
    SLOTS.forEach(function (sd) {
      m.images.filter(function (im) { return im.slot === sd.key; }).forEach(function (im) {
        out.push({ image: im, model: m, slot: sd });
      });
    });
    return out;
  }

  function openLightbox(list, imageId) {
    var idx = list.findIndex(function (x) { return x.image.id === imageId; });
    if (idx < 0) return;      // 点中的图不在这份列表里：宁可不开，也别开成别人的图
    lightboxList = list;
    lightboxIndex = idx;
    showLightbox();
  }
  function showLightbox() {
    var item = lightboxList[lightboxIndex];
    if (!item) return;
    var stage = $("lbStage");
    stage.innerHTML = "";
    var url = urlCache[item.image.blobId];
    if (!url) {
      stage.appendChild(el("div", { class: "cmp-missing",
        text: (item.image.path && !folderReady()) ? t("img.needAccess") : t("img.failed") }));
    } else if (/pdf/i.test(item.image.mime) || /\.pdf$/i.test(item.image.name)) {
      stage.appendChild(el("embed", { src: url, type: "application/pdf" }));
    } else {
      var isVector = /svg/i.test(item.image.mime) || /\.svg$/i.test(item.image.name);
      stage.appendChild(el("img", { src: url, alt: item.image.name, class: isVector ? "vector" : null }));
    }
    $("lbTitle").textContent = displayName(item.model) + " · " + t(item.slot.labelKey) + " · " + item.image.name +
      "   (" + (lightboxIndex + 1) + "/" + lightboxList.length + ")";
    $("lightbox").hidden = false;
  }
  function stepLightbox(d) {
    if (!lightboxList.length) return;
    lightboxIndex = (lightboxIndex + d + lightboxList.length) % lightboxList.length;
    showLightbox();
  }
  function closeLightbox() { $("lightbox").hidden = true; $("lbStage").innerHTML = ""; }

  // ---------------- 导出 / 导入 ----------------
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(",");
    var mime = (parts[0].match(/data:([^;]+)/) || [null, "application/octet-stream"])[1];
    var bin = atob(parts[1] || "");
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function exportProject() {
    // 文件夹模式下还没恢复访问时，每张图都读不出来，导出的会是一份"只有元数据"的空壳。
    // 而页脚恰好建议用户在换电脑前先导出——不拦住的话备份会静悄悄地丢掉全部图片。
    if (dirHandle && !folderReady()) { banner(t("msg.exportNeedAccess"), true); return; }

    banner(t("msg.packing"), false);
    var entries = [];
    project.cases.forEach(function (c) {
      c.models.forEach(function (m) { m.images.forEach(function (im) { entries.push(im); }); });
    });

    /* 不先攒成一个大对象再 JSON.stringify：那样 base64 会在内存里同时存在两三份，
       几百 MB 的项目直接撞上 V8 的单字符串上限（RangeError: Invalid string length）。
       改成一边读一边拼 JSON 片段，交给 Blob 去拼接（大了它会落盘）。 */
    var parts = ['{"format":"fml-compare-project","version":1,"exportedAt":' +
      JSON.stringify(new Date().toISOString()) +
      ',"project":' + JSON.stringify(stripRuntime(project)) + ',"blobs":{'];
    var done = 0, missing = 0;
    var chain = Promise.resolve();

    entries.forEach(function (im) {
      chain = chain.then(function () {
        return readImageBlob(im).then(function (blob) {
          if (!blob) { missing++; return; }
          return blobToDataUrl(blob).then(function (d) {
            parts.push((done ? "," : "") + JSON.stringify(im.blobId) + ":" + JSON.stringify(d));
            done++;
          });
        }).catch(function (e) {
          missing++;
          console.error("[fml] 导出时读不出图片:", im.name, e);
        });
      });
    });

    chain.then(function () {
      parts.push("}}");
      var url = URL.createObjectURL(new Blob(parts, { type: "application/json" }));
      var a = el("a", { href: url,
        download: "fml_compare_project_" + localDateStamp() + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
      // 立刻 revoke 会让下载拿不到内容，但一直不 revoke 整份项目就常驻内存到关页面为止
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      banner(missing
        ? t("msg.exportedPartial", { missing: missing, total: entries.length })
        : t("msg.exported", { n: done }), !!missing);
    }).catch(function (e) { banner(t("msg.exportFail", { e: errText(e) }), true); });
  }

  /** 导出文件名用本地日期（toISOString 是 UTC，晚上导出会显示成第二天） */
  function localDateStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /** 下划线开头的都是运行期状态（_selected / _filters），不进导出文件 */
  function stripRuntime(p) {
    return JSON.parse(JSON.stringify(p, function (k, v) {
      return k.charAt(0) === "_" ? undefined : v;
    }));
  }

  /**
   * 把外来数据补齐成渲染代码假定的形状。
   * 少一个 models 数组就能让 reassignAll() 抛异常，而 reassignAll 在启动时跑在 bind()
   * 之前——一旦这种数据存进了 IndexedDB，下次打开整页一个事件都不会绑上，
   * 拖拽、导入、切换语言全部失灵且无法自救。所以来路不明的数据一律先过一遍这里。
   */
  function normalizeProject(p) {
    if (!p || typeof p !== "object") p = {};
    if (!Array.isArray(p.cases)) p.cases = [];
    p.cases = p.cases.filter(function (c) { return c && typeof c === "object"; });
    p.cases.forEach(function (c) {
      if (!c.id) c.id = uid();
      if (typeof c.name !== "string" || !c.name) c.name = t("case.untitled");
      c.inputs = (Array.isArray(c.inputs) ? c.inputs : []).filter(function (i) { return i && typeof i === "object"; });
      c.models = (Array.isArray(c.models) ? c.models : []).filter(function (m) { return m && typeof m === "object"; });
      c.inputs.forEach(function (i) {
        if (!i.id) i.id = uid();
        if (typeof i.filename !== "string") i.filename = String(i.filename || "");
        if (!i.parsed || !i.parsed.byKey) i.parsed = FMLParser.parseName(i.filename);
      });
      c.models.forEach(function (m) {
        if (!m.id) m.id = uid();
        if (typeof m.folderName !== "string") m.folderName = String(m.folderName || "");
        if (!m.parsed || !m.parsed.byKey) m.parsed = FMLParser.parseName(m.folderName);
        if (!Array.isArray(m.files)) m.files = [];
        m.images = (Array.isArray(m.images) ? m.images : [])
          .filter(function (im) { return im && typeof im === "object" && im.blobId; });
      });
    });
    if (!p.cases.some(function (c) { return c.id === p.activeCaseId; })) {
      p.activeCaseId = p.cases.length ? p.cases[0].id : null;
    }
    return p;
  }

  /**
   * 把导入/文件夹清单里的项目落到当前存储模式（重新决定每张图存哪）。
   * keepPaths：文件夹清单专用 —— 那些图片本来就躺在这个文件夹里，路径必须保留。
   */
  function applyImportedProject(payload, keepPaths) {
    var blobs = (payload && payload.blobs) || {};
    if (!payload || !payload.project || !Array.isArray(payload.project.cases)) {
      return Promise.reject(new Error("empty project"));
    }
    var incoming = normalizeProject(payload.project);

    Object.keys(urlCache).forEach(releaseUrl);
    var chain = Promise.resolve();
    var count = 0;

    incoming.cases.forEach(function (c) {
      c.models.forEach(function (m) {
        m.images.forEach(function (im) {
          var d = blobs[im.blobId];
          if (!d) {
            // 导出文件里没带这张图（导出时就没读出来）。它的 path 是别人机器上的，
            // 而落盘路径只由 case 名/模型名/槽位决定，留着的话会在当前绑定的文件夹里
            // 命中一个同名但毫不相干的文件，把别的实验的图当成自己的显示出来。
            if (!keepPaths) delete im.path;
            return;
          }
          chain = chain.then(function () {
            delete im.path;                     // 按当前模式重新落盘
            return saveImageBlob(c, m, im, dataUrlToBlob(d))
              .then(function () { count++; })
              .catch(function (e) {             // 单张图坏掉不影响整个项目导入
                console.error("[fml] 恢复图片失败:", im.name, e);
              });
          });
        });
      });
    });

    return chain.then(function () {
      project = incoming;
      reassignAll();
      return FMLStore.saveProject(project);
    }).then(function () {
      // 被换掉的那个项目的图片再也引用不到了，顺手回收，免得浏览器配额被旧数据占死
      return FMLStore.gc(project).catch(function () {});
    }).then(function () { return count; });
  }

  function importProject(file) {
    var r = new FileReader();
    r.onload = function () {
      var payload;
      try { payload = JSON.parse(r.result); }
      catch (e) { banner(t("msg.importBadJson"), true); return; }
      if (!payload || payload.format !== "fml-compare-project") {
        banner(t("msg.importBadFile"), true); return;
      }
      if (!confirm(t("confirm.import"))) return;
      // 包一层 Promise：applyImportedProject 里同步抛出的异常也要能被下面的 catch 接住，
      // 否则页面既不提示、又已经把 urlCache 清空了，看上去就是"点了导入什么都没发生"
      Promise.resolve().then(function () {
        return applyImportedProject(payload, false);
      }).then(function (n) {
        banner(t("msg.importDone", { n: n }), false);
        save();            // 文件夹模式下要把新项目写进磁盘清单，不然下次绑定会读到旧的
        render();
      }).catch(function (e) { banner(t("msg.importFail", { e: errText(e) }), true); });
    };
    r.readAsText(file);
  }

  // ---------------- 存储位置 ----------------
  function renderStorage() {
    var row = $("storageRow");
    var hint = $("storageHint");
    row.innerHTML = "";

    if (!FMLDir.supported()) {
      row.appendChild(el("span", { class: "storage-mode", text: t("storage.browser") }));
      hint.textContent = t("storage.hint.unsupported");
      return;
    }

    if (!dirHandle) {
      row.appendChild(el("span", { class: "storage-mode", text: t("storage.browserDefault") }));
      row.appendChild(el("button", {
        class: "btn btn-sm btn-primary", text: t("storage.pick"), onclick: bindFolder
      }));
      hint.textContent = t("storage.hint.pick");
      return;
    }

    if (dirPerm !== "granted") {
      row.appendChild(el("span", { class: "storage-mode needs-perm" },
        [t("storage.needPerm"), el("span", { class: "storage-path", text: dirLabel() })]));
      row.appendChild(el("button", {
        class: "btn btn-sm btn-primary", text: t("storage.restore"), onclick: restoreFolderAccess
      }));
      row.appendChild(el("button", { class: "btn btn-sm", text: t("storage.useBrowser"), onclick: unbindFolder }));
      hint.textContent = t("storage.hint.needPerm");
      return;
    }

    row.appendChild(el("span", { class: "storage-mode bound" },
      [t("storage.bound"), el("span", { class: "storage-path", text: dirLabel() })]));
    row.appendChild(el("button", { class: "btn btn-sm", text: t("storage.changeFolder"), onclick: bindFolder }));
    row.appendChild(el("button", { class: "btn btn-sm", text: t("storage.useBrowser"), onclick: unbindFolder }));
    hint.textContent = t("storage.hint.bound", { manifest: FMLDir.MANIFEST });
  }

  function serialChain(jobs) {
    return jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve());
  }

  function bindFolder() {
    if (!FMLDir.supported()) return;
    var handle;
    var prevHandle = dirHandle, prevReady = folderReady();
    FMLDir.pick().then(function (h) {
      handle = h;
      return FMLDir.requestPermission(h);
    }).then(function (perm) {
      if (perm !== "granted") { banner(t("msg.noWritePerm"), true); return; }
      // 清单读不出来时绝不能当成"空文件夹"继续：后面的 save() 会用当前（可能是空的）
      // 项目把它整个覆盖掉，磁盘上的图片就只剩一堆没有归属的文件名了
      return FMLDir.readJSON(handle).catch(function (e) {
        banner(t("msg.manifestUnreadable", { manifest: FMLDir.MANIFEST, e: errText(e) }), true);
        return { __unreadable: true };
      }).then(function (manifest) {
        if (manifest && manifest.__unreadable) return;

        var incoming = manifest && manifest.project && manifest.project.cases;
        var loadIt = false;
        if (incoming && incoming.length) {
          loadIt = confirm(t("confirm.folderHasData", { n: incoming.length }));
        }
        dirHandle = handle;
        dirPerm = "granted";
        return FMLStore.kvSet("dirHandle", handle).then(function () {
          if (loadIt) {
            return applyImportedProject({ project: manifest.project, blobs: {} }, true).then(function () {
              banner(t("msg.loadedFromFolder", { name: dirLabel() }), false);
            });
          }
          return migrateToFolder(prevHandle, prevReady).then(function (r) {
            if (r.failed) {
              banner(t("msg.migratePartial", { name: dirLabel(), n: r.moved, failed: r.failed }), true);
            } else {
              banner(r.moved ? t("msg.boundMigrated", { name: dirLabel(), n: r.moved })
                             : t("msg.bound", { name: dirLabel() }), false);
            }
          });
        });
      });
    }).then(function () {
      if (dirHandle) { save(); render(); }
    }).catch(function (e) {
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return;  // 用户取消
      banner(t("msg.pickFail", { e: errText(e) }), true);
    });
  }

  /**
   * 把所有图片搬到当前绑定的文件夹里。
   * 来源有两种：浏览器 IndexedDB，以及"换个文件夹…"时的上一个文件夹 ——
   * 后者不能跳过，否则换文件夹后这些图既不在新文件夹里、IndexedDB 里也早被删了，
   * 清单却还记着旧路径，结果是整屏图片全部打不开且无从恢复。
   */
  function migrateToFolder(prevHandle, prevReady) {
    var jobs = [], moved = 0, failed = 0;
    project.cases.forEach(function (c) {
      c.models.forEach(function (m) {
        m.images.forEach(function (im) {
          jobs.push(function () {
            var oldPath = im.path;
            var read;
            if (oldPath) {
              if (!prevReady || !prevHandle) { failed++; return Promise.resolve(); }
              read = FMLDir.readFile(prevHandle, oldPath).catch(function () { return null; });
            } else {
              read = FMLStore.getBlob(im.blobId)
                .then(function (rec) { return rec && rec.blob; })
                .catch(function () { return null; });
            }
            return read.then(function (blob) {
              if (!blob) { failed++; return; }
              delete im.path;                    // 让 saveImageBlob 按新文件夹重算路径
              return saveImageBlob(c, m, im, blob).then(function () {
                moved++;
                // 原来在浏览器里的才删；原来在旧文件夹里的文件留着不动
                if (!oldPath) return FMLStore.deleteBlob(im.blobId).catch(function () {});
              }).catch(function (e) {
                if (oldPath) im.path = oldPath;  // 写失败就退回旧路径，别把引用弄丢
                failed++;
                console.error("[fml] 迁移图片失败:", im.name, e);
              });
            });
          });
        });
      });
    });
    return serialChain(jobs).then(function () { return { moved: moved, failed: failed }; });
  }

  /** 本地文件夹 -> 浏览器存储（磁盘上的文件保留不删） */
  function unbindFolder() {
    // 没拿到权限时一张图都读不回来，但按钮就摆在"需要重新授权"那一行旁边。
    // 照常执行的话句柄会被销毁、"恢复访问"按钮跟着消失，只能手动重新选一次同一个文件夹。
    var canRead = folderReady();
    if (!confirm(canRead ? t("confirm.unbind") : t("confirm.unbindNoAccess"))) return;

    var jobs = [], n = 0, failed = 0;
    project.cases.forEach(function (c) {
      c.models.forEach(function (m) {
        m.images.forEach(function (im) {
          if (!im.path) return;
          jobs.push(function () {
            if (!canRead) { failed++; return Promise.resolve(); }
            return readImageBlob(im).then(function (blob) {
              if (!blob) { failed++; return; }
              var keep = im.path;
              delete im.path;
              return FMLStore.putBlob(im.blobId, blob, { name: im.name, mime: im.mime })
                .then(function () { n++; })
                .catch(function () { im.path = keep; failed++; });
            }).catch(function () { failed++; });
          });
        });
      });
    });
    serialChain(jobs).then(function () {
      dirHandle = null; dirPerm = null;
      return FMLStore.kvDel("dirHandle");
    }).then(function () {
      if (!canRead && failed) banner(t("msg.unboundNoAccess", { n: failed }), true);
      else if (failed) banner(t("msg.unboundPartial", { n: n, failed: failed }), true);
      else banner(n ? t("msg.unboundN", { n: n }) : t("msg.unbound"), false);
      save(); render();
    }).catch(function (e) { banner(t("msg.switchFail", { e: errText(e) }), true); });
  }

  function restoreFolderAccess() {
    FMLDir.requestPermission(dirHandle).then(function (p) {
      dirPerm = p;
      if (p === "granted") banner("", false);
      else banner(t("msg.stillNoPerm"), true);
      render();
    }).catch(function (e) { banner(t("msg.authFail", { e: errText(e) }), true); });
  }

  // ---------------- 渲染 ----------------
  /** 把 src 整个并进 dst：同名（去扩展名后）的输入数据合成一份，模型跟着走 */
  function mergeCases(src, dst) {
    if (!src || !dst || src.id === dst.id) return;
    src.inputs.forEach(function (inp) {
      var stem = FMLParser.stripExt(inp.filename);
      var hit = dst.inputs.filter(function (i) { return FMLParser.stripExt(i.filename) === stem; })[0];
      if (hit) {
        src.models.forEach(function (m) { if (m.inputId === inp.id) m.inputId = hit.id; });
        if (!inp.derived) { delete hit.derived; hit.filename = inp.filename; hit.parsed = inp.parsed; }
      } else {
        dst.inputs.push(inp);
      }
    });
    src.models.forEach(function (m) { dst.models.push(m); });
    project.cases = project.cases.filter(function (c) { return c.id !== src.id; });
    project.activeCaseId = dst.id;
    reassignAll();
    banner(t("msg.merged", { from: src.name, to: dst.name }), false);
    save(); render();
  }

  function renderTabs() {
    var wrap = $("caseTabs");
    wrap.innerHTML = "";
    $("mergeCaseBtn").hidden = project.cases.length < 2;
    project.cases.forEach(function (c) {
      var isActive = c.id === project.activeCaseId;
      var tab = el("div", { class: "case-tab" + (isActive ? " active" : "") }, [
        el("span", {
          class: "case-name", text: c.name,
          ondblclick: function () {
            var n = prompt(t("prompt.renameCase"), c.name);
            if (!n) return;
            n = n.trim();
            if (!n || n === c.name) return;
            // 改成和已有 case 同名 = 想把它们合并，而不是造出两个重名的
            var other = project.cases.filter(function (x) { return x.id !== c.id && x.name === n; })[0];
            if (other) {
              if (confirm(t("confirm.mergeCase", { from: c.name, to: n }))) mergeCases(c, other);
              return;
            }
            c.name = n; save(); render();
          }
        }),
        el("span", { class: "count", text: t("case.counts", { i: c.inputs.length, m: c.models.length }) }),
        el("span", {
          class: "x", text: "✕", title: t("common.delete"),
          onclick: function (e) {
            e.stopPropagation();
            if (!confirm(t("confirm.deleteCase", { name: c.name }))) return;
            c.models.forEach(function (m) {
              m.images.forEach(function (im) { removeImageBlob(im); releaseUrl(im.blobId); });
            });
            project.cases = project.cases.filter(function (x) { return x.id !== c.id; });
            if (project.activeCaseId === c.id) {
              project.activeCaseId = project.cases.length ? project.cases[0].id : null;
            }
            save(); render();
          }
        })
      ]);
      tab.addEventListener("click", function () {
        project.activeCaseId = c.id; save(); render();
      });
      wrap.appendChild(tab);
    });
  }

  function ensureUrls(c) {
    var need = [];
    c.models.forEach(function (m) {
      m.images.forEach(function (im) { if (!urlCache[im.blobId]) need.push(im); });
    });
    return Promise.all(need.map(function (im) {
      return readImageBlob(im).then(function (blob) {
        if (blob) urlCache[im.blobId] = URL.createObjectURL(blob);
      }).catch(function () {});
    }));
  }

  var renderSeq = 0;

  function render() {
    // ensureUrls 在文件夹模式下要真的去磁盘读几十上百个文件，慢的时候用户早就点去
    // 别的 case 了。没有这个序号的话，先发起的那次渲染会把后发起的覆盖掉：
    // 页面画着 A，标签页却高亮 B，而 A 里那些按钮的闭包改的是 A —— 删除、打星
    // 全落在"不是当前显示"的 case 上。
    var seq = ++renderSeq;
    renderStorage();
    renderTabs();
    var c = activeCase();
    $("caseBody").hidden = !c;
    $("emptyState").hidden = !!c;
    if (!c) return;
    ensureUrls(c).then(function () {
      if (seq !== renderSeq) return;
      renderDataTree(c);
      renderParamFilter(c);
      renderCompareFilter(c);
      renderCompare(c);
    });
  }

  // ---------------- 事件绑定 ----------------
  /* 拖进来的是文件夹时，dataTransfer.files 里的"目录"是空壳，
     必须用 webkitGetAsEntry() 递归把里面的文件读出来。 */
  function readDirEntries(reader) {
    var all = [];
    return new Promise(function (res, rej) {
      function next() {
        reader.readEntries(function (batch) {
          if (!batch.length) { res(all); return; }   // readEntries 一次最多 100 条，要读到空为止
          all = all.concat(Array.prototype.slice.call(batch));
          next();
        }, rej);
      }
      next();
    });
  }

  function walkEntry(entry, prefix) {
    var path = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isFile) {
      return new Promise(function (res) {
        entry.file(function (f) { res([{ file: f, path: path }]); }, function () { res([]); });
      });
    }
    if (entry.isDirectory) {
      return readDirEntries(entry.createReader()).then(function (children) {
        return Promise.all(children.map(function (ch) { return walkEntry(ch, path); }));
      }).then(flatten);
    }
    return Promise.resolve([]);
  }

  function flatten(lists) {
    return lists.reduce(function (a, b) { return a.concat(b); }, []);
  }

  function readDroppedEntries(dt) {
    var roots = Array.prototype.slice.call(dt.items || [])
      .map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; })
      .filter(Boolean);
    if (!roots.length) return Promise.resolve(toEntries(dt.files || []));
    return Promise.all(roots.map(function (r) { return walkEntry(r, ""); })).then(flatten);
  }

  function bindDrop(zoneId, handler, isFolderZone) {
    var z = $(zoneId);
    z.addEventListener("dragover", function (e) { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", function () { z.classList.remove("over"); });
    z.addEventListener("drop", function (e) {
      e.preventDefault(); z.classList.remove("over");
      if (!isFolderZone) {
        if (e.dataTransfer.files && e.dataTransfer.files.length) handler(e.dataTransfer.files);
        return;
      }
      banner(t("msg.reading"), false);
      readDroppedEntries(e.dataTransfer).then(function (entries) {
        if (entries.length) handler(entries);
        else banner("", false);
      }).catch(function (err) {
        console.error("[fml] 读取拖入的文件夹失败:", err);
        banner(t("msg.importFail", { e: errText(err) }), true);
      });
    });
  }

  function bind() {
    /* 拖到上传框以外的地方时，浏览器默认会直接打开那个文件，把整个页面顶掉
       （未保存的提示条、正在看的对比视图全没了）。统一挡掉。 */
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) { e.preventDefault(); });

    $("inputFile").addEventListener("change", function (e) {
      if (e.target.files.length) addInputFiles(e.target.files);
      e.target.value = "";
    });
    $("modelFolder").addEventListener("change", function (e) {
      if (e.target.files.length) addModelFolder(toEntries(e.target.files));
      e.target.value = "";
    });
    $("resultFolder").addEventListener("change", function (e) {
      if (e.target.files.length) addResultFolder(toEntries(e.target.files));
      e.target.value = "";
    });
    bindDrop("inputDrop", addInputFiles, false);
    bindDrop("modelDrop", addModelFolder, true);
    bindDrop("resultDrop", addResultFolder, true);

    $("collapseAllBtn").addEventListener("click", function () { setAllCollapsed(true); });
    $("expandAllBtn").addEventListener("click", function () { setAllCollapsed(false); });

    $("mergeCaseBtn").addEventListener("click", function () {
      var c = activeCase();
      if (!c) return;
      var others = project.cases.filter(function (x) { return x.id !== c.id; });
      if (!others.length) return;
      ask(t("ask.mergeCase.title"), t("ask.mergeCase.body", { name: c.name }),
        [{ key: "cancel", label: t("ask.cancel") }].concat(
          others.map(function (o) { return { key: o.id, label: o.name }; }))
      ).then(function (choice) {
        if (!choice || choice === "cancel") return;
        mergeCases(c, project.cases.filter(function (x) { return x.id === choice; })[0]);
      });
    });

    $("addCaseBtn").addEventListener("click", function () {
      var n = prompt(t("prompt.newCase"), "");
      if (!n) return;
      var c = findOrCreateCase(n.trim());
      project.activeCaseId = c.id;
      save(); render();
    });

    $("cmpLayout").addEventListener("change", function () { renderCompare(activeCase()); });
    $("cmpCols").addEventListener("change", function () { renderCompare(activeCase()); });

    $("exportBtn").addEventListener("click", exportProject);
    $("importBtn").addEventListener("click", function () { $("importInput").click(); });
    $("importInput").addEventListener("change", function (e) {
      if (e.target.files[0]) importProject(e.target.files[0]);
      e.target.value = "";
    });

    $("themeBtn").addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      $("themeBtn").textContent = next === "dark" ? t("ui.theme.toLight") : t("ui.theme.toDark");
      try { localStorage.setItem("fml_theme", next); } catch (e) {}
    });

    // 一键中英切换：静态文案 + 动态渲染的内容一起刷新
    $("langBtn").addEventListener("click", function () {
      I18N.setLang(I18N.getLang() === "zh" ? "en" : "zh");
      banner("", false);        // 之前那条提示是旧语言写的，直接清掉免得中英混排
      applyI18n();
      render();
    });

    $("lbClose").addEventListener("click", closeLightbox);
    $("lbPrev").addEventListener("click", function () { stepLightbox(-1); });
    $("lbNext").addEventListener("click", function () { stepLightbox(1); });
    $("lbStage").addEventListener("click", function (e) { if (e.target.id === "lbStage") closeLightbox(); });
    document.addEventListener("keydown", function (e) {
      if ($("lightbox").hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    });
  }

  /** 刷新所有静态文案（含随主题变化的按钮、页脚的占用大小） */
  function applyI18n() {
    I18N.applyStatic();
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    $("themeBtn").textContent = dark ? t("ui.theme.toLight") : t("ui.theme.toDark");
    $("storageInfo").textContent = "";
    if (project) updateStorageInfo();
  }

  // ---------------- 启动 ----------------
  try {
    var savedTheme = localStorage.getItem("fml_theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  } catch (e) {}
  I18N.initLang();
  applyI18n();

  FMLStore.init().then(function () {
    // 恢复上次绑定的文件夹（句柄本身能存进 IndexedDB，但权限要用户再点一次）
    return FMLStore.kvGet("dirHandle").then(function (h) {
      if (!h) return;
      dirHandle = h;
      return FMLDir.queryPermission(h).then(function (p) { dirPerm = p; })
        .catch(function () { dirPerm = "prompt"; });
    }).catch(function () {});
  }).then(function () {
    return FMLStore.loadProject();
  }).then(function (p) {
    project = normalizeProject(p || { version: 1, activeCaseId: null, cases: [] });
    if (!project.version) project.version = 1;
    // 先绑事件再渲染：渲染路径上任何一个异常都不该让页面变成"按钮全不响应"的死页
    bind();
    applyI18n();
    FMLStore.persisted().then(function (persistedNow) {
      persistedState = persistedNow;   // 只查询、不申请，避免一打开就弹权限框
      updateStorageInfo();
    }).catch(function () {});
    try {
      reassignAll();   // 老数据没有 inputId，这里补上归类
    } catch (e) {
      console.error("[fml] 归类失败:", e);
    }
    render();
    updateStorageInfo();
  }).catch(function (e) {
    banner(t("msg.initFail", { e: errText(e) }), true);
  });
})();
