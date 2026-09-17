/* Main logic: cases / input data / model folders / image comparison */
(function () {
  "use strict";

  var t = I18N.t;

  // Formats a browser can display directly
  var IMAGE_EXT = /\.(png|apng|jpe?g|jfif|webp|avif|gif|bmp|ico|svgz?|pdf)$/i;
  var VECTOR_EXT = /\.(svgz?|pdf)$/i;
  // Images the browser cannot render (common MATLAB output); when one shows up we want
  // to say so explicitly.
  // Do not list non-graphics files such as .mat / .log here, or the message misleads.
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

  // Local-folder mode
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

  /** Persist according to the current mode: a local folder, or the browser's IndexedDB */
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
    ensurePersist();   // only request persistence once we really start storing in the browser (does not block the write)
    return FMLStore.putBlob(entry.blobId, blob, { name: entry.name, mime: entry.mime });
  }

  /* Request persistence exactly once, and only when storing an image in the browser.
     Not at startup: Firefox shows a permission prompt, and having that appear the moment
     the page opens is jarring. Folder mode does not need it either -- those images are
     already files on disk. */
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

  // ---------------- Small helpers ----------------
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
  /** Multi-choice dialog; resolves with the key that was clicked (Esc / backdrop = null) */
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
        // In folder mode also write the manifest -- that is what restores the project elsewhere
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

  var persistedState = null;   // true / false / null (browser does not support it)

  function updateStorageInfo() {
    FMLStore.estimate().then(function (est) {
      if (!est || !est.usage) return;
      var txt = est.quota
        ? t("storage.usage", { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) })
        : t("storage.used", { size: fmtBytes(est.usage) });
      // Only warn about eviction when the images really are in the browser; in folder mode they are on disk
      if (!folderReady() && persistedState === false) txt += t("storage.notPersisted");
      else if (!folderReady() && persistedState === true) txt += t("storage.isPersisted");
      $("storageInfo").textContent = txt;
    });
  }

  // ---------------- Project state ----------------
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

  // ---------------- Input data ----------------
  function addInputFiles(fileList) {
    var touched = null;
    Array.prototype.forEach.call(fileList, function (f) {
      var parsed = FMLParser.parseName(f.name);
      var c = findOrCreateCase(caseNameFor(f.name));
      // Compare on the extension-less name: an inferred entry has no extension, while the
      // file the user uploads may be .mat / .h5 / .npz
      var stem = FMLParser.stripExt(f.name);
      var dup = c.inputs.filter(function (i) { return FMLParser.stripExt(i.filename) === stem; })[0];
      if (!dup) {
        c.inputs.push({ id: uid(), filename: f.name, parsed: parsed });
      } else {
        delete dup.derived;      // was inferred; the real file has now been uploaded
        dup.filename = f.name;   // use the real file name, extension included
        dup.parsed = parsed;
      }
      touched = c;
    });
    if (touched) project.activeCaseId = touched.id;
    reassignAll();          // new input data may give previously unassigned models a home
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

  // ---------------- Model folders (several at a time) ----------------
  /** Treat as a model folder only; the input data is guessed from the parameters */
  function addModelFolder(entries) { importFolders(entries, false); }

  /** One-step upload: the folder name yields both the model name and the input data name
      (the part before _L3N10) */
  function addResultFolder(entries) { importFolders(entries, true); }

  /** An <input> hands over a flat File list; normalise it to {file, path} */
  function toEntries(fileList) {
    return Array.prototype.slice.call(fileList).map(function (f) {
      return { file: f, path: f.webkitRelativePath || f.name };
    });
  }

  /** A name needs more than 2 non-date parameters to look like a model folder
      ("report_0909" does not) */
  function looksLikeModelName(name) {
    var p = FMLParser.parseName(name);
    return p.params.filter(function (x) { return x.key !== "date"; }).length >= 2;
  }

  /** Is prefix a whole-token prefix of name? (airfoil is one for airfoil_gp_rbf) */
  function isTokenPrefix(prefix, name) {
    if (!prefix) return false;
    var a = FMLParser.stripExt(prefix).split("_").filter(Boolean);
    var b = FMLParser.stripExt(name).split("_").filter(Boolean);
    if (!a.length || a.length >= b.length) return false;
    return a.every(function (tok, i) { return b[i] === tok; });
  }

  /**
   * Decide which case a folder or file belongs to.
   * Name follows a known convention -> use the parsed prefix (your own data is unaffected).
   * Unrecognised name -> the prefix rule would swallow the part that distinguishes the
   * models and give every model a case of its own. So instead: prefer an existing case
   * whose name is exactly a token prefix of this name, and otherwise fall back to the
   * first token.
   */
  var NO_PREFIX_CASE = "default";   // case name used when the first token is already a parameter
                                    // (double-click the tab to rename)

  function caseNameFor(name) {
    if (looksLikeModelName(name)) {
      // A name made entirely of parameters (20k_heter_mem20_…) has an empty prefix.
      // Falling back to "the first token" would split 20k / 40k into two cases, when the
      // sample size is supposed to be a filter *inside* a case. So they all land in one
      // default case instead.
      return FMLParser.parseName(name).prefix || NO_PREFIX_CASE;
    }

    // An existing case name that is exactly a token prefix of this one -> join it
    var hit = project.cases.filter(function (c) { return isTokenPrefix(c.name, name); })
      .sort(function (a, b) { return b.name.length - a.name.length; })[0];
    if (hit) return hit.name;

    // Otherwise group by the first token. Deliberately not "the common prefix of this
    // batch": that would make the result depend on which folders happen to be in the
    // batch, so importing one at a time would disagree with importing them together.
    // The first token is stable and order-independent; over-splitting can be undone
    // with "Merge case…".
    var tokens = FMLParser.stripExt(name).split("_").filter(Boolean);
    return tokens[0] || name;
  }

  /** Does the directory at this depth hold images directly?
      (depth = how many path segments the directory itself occupies) */
  function hasImagesAt(entries, depth) {
    return entries.some(function (en) {
      return en.path.split("/").length === depth + 1 && IMAGE_EXT.test(en.file.name);
    });
  }

  /** Slice out the subdirectories at this depth: {name -> entries}, in order of appearance */
  function subDirsOf(entries, depth) {
    var map = {}, order = [];
    entries.forEach(function (en) {
      var parts = en.path.split("/");
      if (parts.length <= depth + 1) return;      // a file sitting at this level, not a subdirectory
      if (!map[parts[depth]]) { map[parts[depth]] = []; order.push(parts[depth]); }
      map[parts[depth]].push(en);
    });
    return { map: map, order: order };
  }

  /**
   * Recursively work out which directories are "result folders".
   *
   * The hard part: <model name>/figures/traj.png and report_0909/<model name>/traj.png
   * have identical structure, so only the names can tell them apart. The rules:
   *   - images sit directly in this level -> this is the model
   *     (checkpoints/, logs/ and friends count as attached directories)
   *   - a subdirectory looks like a model -> this level is just a container, descend
   *     (when the parent name itself looks like a model name, the subdirectory has to
   *      look like one too -- otherwise figures/ would be taken for the model and the
   *      real model name would be lost)
   *   - neither, but there are images further down (runs/2026-09/<model>/…) -> keep going
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
    // An intermediate directory: no images of its own, no model-like subdirectory, but
    // images further down -- so it is only a wrapper level
    var deeperImages = entries.some(function (en) {
      return en.path.split("/").length > depth + 2 && IMAGE_EXT.test(en.file.name);
    });
    if (deeperImages) {
      subs.order.forEach(function (s) { collectModelFolders(s, subs.map[s], depth + 1, out); });
      return;
    }
    out.push({ folderName: name, entries: entries, depth: depth });
  }

  /** Split a pile of {file, path} into model folders */
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

  /** Turn an exception into one readable sentence. Chrome's DOMException.message is often
      vague on its own, so the name has to come along. */
  function errText(e) {
    if (!e) return "unknown error";
    var name = e.name ? e.name : "";
    var msg = e.message || String(e);
    return name && msg.indexOf(name) < 0 ? name + ": " + msg : msg;
  }

  function noteFailure(stats, what, e) {
    // A page cannot see the absolute path, so only the relative length is available
    // (the real one is longer still)
    stats.failures.push({ what: what, err: errText(e), pathLen: String(what).length });
    // Full stack goes to the console; the UI only gets the summary
    console.error("[fml] failed to process:", what, e);
  }

  function importFolders(entries, deriveInput) {
    var groups = groupIntoModelFolders(entries);
    if (!groups.length) return;

    var stats = { folders: 0, images: 0, files: 0, skipped: 0, last: null, lastInput: null,
                  failures: [], noImage: [] };
    banner(t("msg.reading"), false);

    // One bad folder or image no longer aborts the whole batch
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
        // Translate the two most common failures into what to do about them, rather than
        // throwing an error name at the user
        if (/QuotaExceeded/i.test(f0.err)) {
          msg += t("msg.hintQuota");
        } else if (/NotFoundError/.test(f0.err) && f0.pathLen) {
          msg += t("msg.hintLongPath", { len: f0.pathLen });
        }
        banner(msg, true);
      } else if (!stats.images && !stats.skipped && stats.noImage.length) {
        // Not a single image made it: say whether the format is unsupported, or there
        // simply were no images
        var d = stats.noImage[0];
        var list = (d.unviewable.length ? d.unviewable : d.names).slice(0, 4).join("、");
        if (d.names.length > 4) list += " …";
        banner(t(d.unviewable.length ? "msg.noImgUnviewable" : "msg.noImgFound",
          { name: d.folder, list: list }), true);
        console.warn("[fml] no images recognised, folder contents:", d.folder, d.names);
      } else if (!stats.images && stats.skipped) {
        // Every image is there, just untouched -- do not call that "no images found"
        banner(groups.length > 1
          ? t("msg.allSkippedBatch", { folders: stats.folders, n: stats.skipped })
          : t("msg.allSkipped", { name: stats.last, n: stats.skipped }), false);
      } else {
        var skip = stats.skipped ? t("msg.skippedSuffix", { n: stats.skipped }) : "";
        if (groups.length > 1) {
          banner((stats.images
            ? t("msg.batchImported", { folders: stats.folders, images: stats.images })
            : t("msg.batchNoImg", { folders: stats.folders })) + skip, false);
        } else if (deriveInput) {
          banner((stats.images
            ? t("msg.resultImported", { name: stats.last, input: stats.lastInput, n: stats.images })
            : t("msg.resultNoImg", { name: stats.last, input: stats.lastInput })) + skip, false);
        } else {
          banner((stats.images
            ? t("msg.imported", { name: stats.last, n: stats.images, rest: stats.files - stats.images })
            : t("msg.importedNoImg", { name: stats.last, n: stats.files })) + skip, false);
        }
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
      // The folder name states the assignment outright; automatic filing must not override it
      var inp = ensureDerivedInput(c, model);
      inputName = inp.filename;
      model.inputId = inp.id;
      model.inputPinned = true;
    } else {
      autoAssignInput(c, model);
    }
    project.activeCaseId = c.id;

    // Only the images are read and stored; the contents of every other file are left alone
    var images = group.entries.filter(function (en) { return IMAGE_EXT.test(en.file.name); });
    stats.folders++;
    stats.files += group.entries.length;
    stats.last = folderName;
    stats.lastInput = inputName;

    // When nothing was recognised, record what is actually in there so the banner can
    // explain why
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
        // A file of this name is already stored: compare modification times only, and
        // skip it if it has not changed rather than rewriting the same bytes
        var prev = model.images.filter(function (im) { return im.name === en.file.name; })[0];
        if (prev && prev.lastModified && en.file.lastModified &&
            en.file.lastModified <= prev.lastModified) {
          stats.skipped++;
          return Promise.resolve();
        }
        return storeImage(model, classify(en.file.name, folderName), en.file)
          .then(function () { stats.images++; })
          .catch(function (e) { noteFailure(stats, en.path, e); });
      };
    }));
  }

  /**
   * Work out which slot an image belongs to.
   *
   * The trap: file names are often "<model folder name>_traj.png", and any token of the
   * model name can collide with a slot keyword (randiSameNumPerTraj contains Traj,
   * ..._pred_... contains pred). Matching against the whole file name makes _error.png
   * hit the trajectory rule first, which puts two images in one slot where they delete
   * each other. So only the fragment that actually distinguishes them is inspected:
   *   1. strip the prefix repeated from the folder name
   *   2. if that still does not match, remove every token of the folder name from the
   *      file name and try again
   * The raw file name is never used as a fallback -- that is exactly where the
   * misclassification came from.
   */
  function classify(filename, folderName) {
    var base = String(filename).replace(/\.[a-z0-9]{1,6}$/i, "");
    var tail = (folderName && base.indexOf(folderName) === 0)
      ? base.slice(folderName.length) : base;

    var cleaned = base;
    if (folderName) {
      folderName.split(/[_\-.\s]+/)
        .filter(function (tok) { return tok.length >= 2; })
        .sort(function (a, b) { return b.length - a.length; })   // longest first, so no substrings survive
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
      mime: file.type || guessMime(file.name), blobId: uid(),
      lastModified: file.lastModified || null   // tells a re-import whether the file changed
    };
    var caseObj = caseOfModel(model);
    return saveImageBlob(caseObj, model, entry, file).then(function () {
      // Single-image slot: displace whatever is in it.
      // Multi-image slot ("other"): displace only the image of the same name --
      // appending instead is what made repeated imports of one file pile up duplicates.
      var drop = model.images.filter(function (im) {
        return im.slot === slotKey && (!slotDef.multi || im.name === entry.name);
      });
      // The trap: in folder mode the path is decided purely by
      // <case>/<model>/<slot>.<ext>, with no reference to which image it is, so the
      // file just written and the "old" one being displaced are very often the same
      // file -- deleting the old entry then deletes the image just written. Re-dropping
      // a retrained result folder is enough to trigger it.
      // The overwrite already performed the replacement, so when the paths match we
      // only drop the in-memory reference.
      drop.forEach(function (im) {
        if (!(im.path && entry.path && im.path === entry.path)) removeImageBlob(im);
        releaseUrl(im.blobId);
      });
      if (drop.length) {
        model.images = model.images.filter(function (im) { return drop.indexOf(im) < 0; });
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

  // ---------------- Which input data a model belongs to ----------------
  function inputOf(c, model) {
    if (!model.inputId) return null;
    return c.inputs.filter(function (i) { return i.id === model.inputId; })[0] || null;
  }

  /** Infer a model's own input data from its name, creating it (marked "inferred")
      if it does not exist yet */
  function ensureDerivedInput(c, model) {
    // When the folder name is nothing but hyperparameters, dataset comes back empty;
    // fall back to the full folder name.
    // No longer forces a ".mat" suffix: people also use .h5 / .npz / .pkl, and matching
    // on the stem is enough when the real file arrives.
    var split = FMLParser.splitModelName(model.folderName);
    var name = split.dataset || FMLParser.stripExt(model.folderName);
    var inp = c.inputs.filter(function (i) { return FMLParser.stripExt(i.filename) === name; })[0];
    if (!inp) {
      inp = {
        id: uid(), filename: name,
        parsed: FMLParser.parseName(name),
        derived: true               // the real .mat has not been uploaded yet
      };
      c.inputs.push(inp);
    }
    return inp;
  }

  /**
   * Find a model's input data.
   * mem / inj / rec / sampling … are each an independent variable, so "one parameter off"
   * means *a different dataset*. Attaching to the closest match would only manufacture a
   * pile of bogus "parameter mismatch" warnings.
   * Hence: only an exact signature match counts; otherwise infer the model's own.
   */
  function autoAssignInput(c, model) {
    if (model.inputPinned) return;

    // An empty signature means not one data parameter was recognised in the name, and
    // then "same signature" does not mean "same dataset": airfoil_meshA and
    // airfoil_meshB both have an empty one, so matching on it would just attach to
    // whichever happens to come first -- with an empty diff list, not even a warning.
    // Inferring from the name is the only honest option.
    var sig = FMLParser.datasetSignature(model.parsed);
    if (sig) {
      var exact = c.inputs.filter(function (i) {
        return FMLParser.datasetSignature(i.parsed) === sig;
      });
      if (exact.length) {
        // The date is not part of the signature (folder and data dates are often a day
        // or two apart), but a matching date still wins
        var sameDate = exact.filter(function (i) {
          return i.parsed.byKey.date === model.parsed.byKey.date;
        });
        model.inputId = (sameDate[0] || exact[0]).id;
        return;
      }
    }
    model.inputId = ensureDerivedInput(c, model).id;
  }

  /** Re-file everything after input data is added or removed. Manual assignments stay
      put unless their target is gone. */
  function reassignAll() {
    project.cases.forEach(function (c) {
      (c.models || []).forEach(function (m) {
        if (m.inputPinned && m.inputId && !inputOf(c, m)) m.inputPinned = false;
        if (!m.inputPinned) autoAssignInput(c, m);
      });
    });
  }

  /* One tint per input data, so "these models came from the same .mat" is visible at a
     glance. Layered as rgba over the card background, which works in both themes. */
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

  /* ---- Marks: star = best, thumbs-up = good, thumbs-down = poor ----
     A mark belongs to one model, and the three are one rating dimension, so a
     model carries at most one (m.mark). The star has one extra constraint: at
     most one per input data, so starring another model clears the previous star
     -- but never touches anyone else's thumbs. */
  var MARKS = [
    { key: "star", labelKey: "mark.opt.star" },
    { key: "up",   labelKey: "mark.opt.up" },
    { key: "down", labelKey: "mark.opt.down" }
  ];

  function setMark(c, model, mark) {
    if (!mark) { delete model.mark; save(); render(); return; }
    if (mark === "star") {
      c.models.forEach(function (m) {
        if (m !== model && m.inputId === model.inputId && m.mark === "star") delete m.mark;
      });
    }
    model.mark = mark;
    save(); render();
  }

  /* One picker per model, showing whichever mark is set.
     Deliberately not a button that cycles on each click: the star is exclusive
     per input data, so cycling 👎 back to unmarked would have to pass through ★
     and would silently steal another model's star. */
  function markSelect(c, m) {
    var sel = el("select", {
      class: "mark-select" + markClass(m),
      title: t("mark.pick"),
      onchange: function () { setMark(c, m, sel.value); },
      onclick: function (e) { e.stopPropagation(); }
    });
    sel.appendChild(el("option", { value: "", text: t("mark.opt.none") }));
    MARKS.forEach(function (def) {
      sel.appendChild(el("option", { value: def.key, text: t(def.labelKey) }));
    });
    sel.value = m.mark || "";
    return sel;
  }

  /** Class suffix that tints a model card / comparison title by its mark */
  function markClass(m) {
    if (m.mark === "star") return " starred";
    if (m.mark === "up") return " mark-up";
    if (m.mark === "down") return " mark-down";
    return "";
  }

  /** Glyph prefixed to a model name in lists and filter chips */
  function markGlyph(m) {
    if (m.mark === "star") return "★ ";
    if (m.mark === "up") return "👍 ";
    if (m.mark === "down") return "👎 ";
    return "";
  }

  function starredOf(c, inp) {
    if (!inp) return null;
    return c.models.filter(function (m) {
      return m.inputId === inp.id && m.mark === "star";
    })[0] || null;
  }


  /** Short label for an input data: drop the prefix it shares with the case name */
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
   * Delete one input data.
   * alsoModels = true  -> its models and their images go too
   * alsoModels = false -> the models stay, marked as user-designated unassigned
   *   (pinned is mandatory: otherwise automatic filing immediately re-infers the dataset
   *    from the model names, and the delete effectively does nothing)
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
            // It has models under it -> let the user choose: delete them too, or keep
            // them as unassigned
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
      // Show the model starred as best for this dataset right in the header
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

    var card = el("div", { class: "model-card" + markClass(m) });

    card.appendChild(el("div", { class: "model-card-head" }, [
      el("button", {
        class: "caret-btn", title: t("model.toggleImages"),
        text: m.imagesCollapsed ? "▸" : "▾",
        onclick: function () { m.imagesCollapsed = !m.imagesCollapsed; save(); render(); }
      }),
      markSelect(c, m),
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

  /** Collapse or expand the images of every model in the current case */
  function setAllCollapsed(collapsed) {
    var c = activeCase();
    if (!c) return;
    c.models.forEach(function (m) { m.imagesCollapsed = collapsed; });
    save(); render();
  }

  /** One dropdown does both: change input data, and move across cases */
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
        wrap.appendChild(slotBox(m, sd, null));   // the append slot
      } else {
        wrap.appendChild(slotBox(m, sd, imgs[0] || null));
      }
    });
    return wrap;
  }

  /* Uploading into a slot by hand can fail too: browser quota exhausted, folder
     permission revoked, a Windows path over the limit. Without this catch the file dialog
     simply closes and nothing happens at all -- no message. And the two most common
     failures, quota and long paths, already have remediation text written; it was just
     reachable only from the import flow. */
  function slotUpload(m, slotKey, file) {
    storeImage(m, slotKey, file).then(function () {
      save(); render();
    }).catch(function (e) {
      var err = errText(e);
      var msg = t("msg.itemFailed", { what: file.name, e: err });
      if (/QuotaExceeded/i.test(err)) msg += t("msg.hintQuota");
      banner(msg, true);
      console.error("[fml] could not save image:", file.name, e);
    });
  }

  function slotBox(m, slotDef, image) {
    var input = el("input", {
      type: "file", accept: "image/*,.pdf,.svg", hidden: true,
      onchange: function () {
        if (input.files && input.files[0]) slotUpload(m, slotDef.key, input.files[0]);
        input.value = "";        // without this, re-picking the same file fires no change event
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
      // Page through this model's own images. collectImages() must not be used: that list
      // is filtered by the comparison view, while the tree renders a thumbnail for every
      // model -- clicking an unticked model's thumbnail would jump to someone else's image.
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

  /** Build an <img>, or an <embed> for a pdf */
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

  // ---------------- Comparison ----------------
  // ---------------- Parameter filters ----------------
  var FILTER_KEYS = ["size", "mem", "inj", "rec", "log", "sample"];

  /** Read one parameter off a model; if its name lacks it, fall back to its input data */
  function paramValueOf(c, m, key) {
    var v = m.parsed.byKey[key];
    if (v !== undefined) return v;
    var inp = inputOf(c, m);
    return inp ? inp.parsed.byKey[key] : undefined;
  }

  /** Which values each parameter takes in this case. Only those with more than one value
      are kept -- filtering on a single value is pointless. */
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

  /** A parameter that has never been touched starts fully selected */
  function filterState(c) {
    if (!c._filters) c._filters = {};
    filterableParams(c).forEach(function (p) {
      if (!c._filters[p.key]) {
        c._filters[p.key] = {};
        p.values.forEach(function (v) { c._filters[p.key][v] = true; });
      } else {
        // newly appeared values start selected too
        p.values.forEach(function (v) {
          if (c._filters[p.key][v] === undefined) c._filters[p.key][v] = true;
        });
      }
    });
    return c._filters;
  }

  /* ---- Mark filter: star / up / down / unmarked, each toggled on its own ---- */
  var MARK_BUCKETS = [
    { key: "star", labelKey: "mark.bucket.star" },
    { key: "up",   labelKey: "mark.bucket.up" },
    { key: "down", labelKey: "mark.bucket.down" },
    { key: "none", labelKey: "mark.bucket.none" }
  ];

  function markBucketOf(m) { return m.mark || "none"; }

  /** Only buckets that actually occur in this case; one bucket means nothing to filter */
  function markBucketsPresent(c) {
    return MARK_BUCKETS.filter(function (b) {
      return c.models.some(function (m) { return markBucketOf(m) === b.key; });
    });
  }

  function markFilterState(c) {
    if (!c._marks) c._marks = {};
    MARK_BUCKETS.forEach(function (b) {
      if (c._marks[b.key] === undefined) c._marks[b.key] = true;
    });
    return c._marks;
  }

  function modelPassesFilter(c, m) {
    if (markFilterState(c)[markBucketOf(m)] === false) return false;
    var f = c._filters || {};
    var params = filterableParams(c);
    for (var i = 0; i < params.length; i++) {
      var key = params[i].key;
      if (!f[key]) continue;
      var v = paramValueOf(c, m, key);
      if (v === undefined) continue;          // a model without this parameter is never filtered out
      if (!f[key][v]) return false;
    }
    return true;
  }

  /* ---- Plot-type filter: trajectories only / errors only / both ---- */
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
    var showTypes = types.length > 1;          // with only one type, filtering is pointless
    var buckets = markBucketsPresent(c);
    var showMarks = buckets.length > 1;        // likewise when nothing has been marked yet
    if (!params.length && !showTypes && !showMarks) return;
    filterState(c);
    slotState(c);
    markFilterState(c);

    wrap.appendChild(el("span", { class: "param-filter-head", text: t("cmp.paramFilter") }));

    if (showMarks) {
      var mitem = el("div", { class: "param-item" }, [
        el("span", { class: "param-item-label", text: t("cmp.markFilter") })
      ]);
      var allMarks = buckets.every(function (b) { return c._marks[b.key]; });
      mitem.appendChild(el("span", {
        class: "chip toggle all" + (allMarks ? " on" : ""), text: t("cmp.all"),
        onclick: function () {
          buckets.forEach(function (b) { c._marks[b.key] = true; });
          refreshCompare(c);
        }
      }));
      buckets.forEach(function (b) {
        mitem.appendChild(el("span", {
          class: "chip toggle" + (c._marks[b.key] ? " on" : ""), text: t(b.labelKey),
          onclick: function () {
            c._marks[b.key] = !c._marks[b.key];
            refreshCompare(c);
          }
        }));
      });
      wrap.appendChild(mitem);
    }

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
        c._filters = {}; c._slots = null; c._marks = null;
        filterState(c); slotState(c); markFilterState(c); refreshCompare(c);
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
    // models added later start ticked as well
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

    // Group the checkboxes by input data too, so it is obvious which models share a
    // dataset. Models removed by the parameter filters are not listed.
    var visible = c.models.filter(function (m) { return modelPassesFilter(c, m); });
    var groups = [];
    c.inputs.forEach(function (i) {
      var ms = visible.filter(function (m) { return m.inputId === i.id; });
      if (ms.length) groups.push({ label: inputShort(i), title: i.filename, models: ms, tint: tintOfInput(c, i) });
    });
    var loose = visible.filter(function (m) { return !inputOf(c, m); });
    if (loose.length) groups.push({ label: t("group.unassigned"), title: "", models: loose, tint: null });

    groups.forEach(function (g) {
      // The dot reuses the group tint from above, so the two areas line up
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
          class: "chip chip-select" + (m.mark === "star" ? " star" : markClass(m)),
          title: m.folderName
        }, [cb, markGlyph(m) + displayName(m)]));
      });
      block.appendChild(chips);
      wrap.appendChild(block);
    });
  }

  /** Display name for a model: drop the prefix shared with the case name, keep the
      distinguishing tail */
  function shortName(m) {
    var raw = m.folderName;
    var pfx = m.parsed.prefix;
    var rest = raw.indexOf(pfx) === 0 ? raw.slice(pfx.length).replace(/^_/, "") : raw;
    var tail = m.parsed.params.filter(function (p) { return p.model; })
      .map(function (p) { return p.value; }).concat(m.parsed.flags);
    return tail.length ? tail.join(" · ") : (rest || raw);
  }

  /* Named by hyperparameters alone, several models can all read "Layer3 Node10" while
     actually differing in their data parameters. This appends whichever parameters
     actually tell the duplicates apart. */
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

      // Greedily take the fewest parameters that separate it from its namesakes, so the
      // label does not turn into a long string
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
              markSelect(c, cell.model), displayName(cell.model)
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
            markSelect(c, m), el("span", { class: "mono", text: m.folderName })
          ]), grid
        ]));
      });
    }

    // Do not leave a blank area; distinguish "the filters removed every model" from
    // "every plot type is switched off". Only types that actually exist count -- "Other"
    // is on by default but may hold no images at all.
    if (!area.children.length) {
      var present = slotTypesPresent(c);
      var anySlot = !present.length || present.some(function (sd) { return slotOn(c, sd.key); });
      area.appendChild(el("div", { class: "empty-state",
        text: anySlot ? t("cmp.noneMatch") : t("cmp.noPlotType") }));
    }
  }

  // ---------------- lightbox ----------------
  /** Every image of one model, in slot order; used for paging from a tree thumbnail */
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
    if (idx < 0) return;      // clicked image is not in this list: better not to open at
                              // all than to open someone else's
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

  // ---------------- Export / import ----------------
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
    // In folder mode before access is restored, every image is unreadable and the export
    // would be a metadata-only shell. The footer happens to advise exporting before
    // switching machines -- without this guard the backup silently loses every image.
    if (dirHandle && !folderReady()) { banner(t("msg.exportNeedAccess"), true); return; }

    banner(t("msg.packing"), false);
    var entries = [];
    project.cases.forEach(function (c) {
      c.models.forEach(function (m) { m.images.forEach(function (im) { entries.push(im); }); });
    });

    /* Deliberately not gathering everything into one object and calling JSON.stringify:
       that keeps two or three copies of the base64 in memory at once, and a few hundred MB
       of project runs straight into V8's single-string limit
       (RangeError: Invalid string length).
       Instead the JSON is assembled in fragments as images are read, and Blob does the
       joining -- it spills to disk when large. */
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
          console.error("[fml] could not read image while exporting:", im.name, e);
        });
      });
    });

    chain.then(function () {
      parts.push("}}");
      var url = URL.createObjectURL(new Blob(parts, { type: "application/json" }));
      var a = el("a", { href: url,
        download: "fml_compare_project_" + localDateStamp() + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
      // Revoking immediately would starve the download, but never revoking pins the whole
      // project in memory until the page closes
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      banner(missing
        ? t("msg.exportedPartial", { missing: missing, total: entries.length })
        : t("msg.exported", { n: done }), !!missing);
    }).catch(function (e) { banner(t("msg.exportFail", { e: errText(e) }), true); });
  }

  /** Local date for the export file name: toISOString is UTC, so an evening export would
      be stamped with tomorrow */
  function localDateStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /** Anything starting with an underscore is runtime state (_selected / _filters) and
      stays out of the export */
  function stripRuntime(p) {
    return JSON.parse(JSON.stringify(p, function (k, v) {
      return k.charAt(0) === "_" ? undefined : v;
    }));
  }

  /**
   * Bring foreign data up to the shape the rendering code assumes.
   * A single missing models array is enough to make reassignAll() throw, and reassignAll
   * used to run before bind() at startup -- once data like that reached IndexedDB, the
   * next load wired up no event handlers at all: dropping, importing and switching
   * language were all dead, with no way to recover from inside the page.
   * So anything of unknown provenance goes through here first.
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
        // Older projects and manifests stored the star as m.starred
        if (m.starred) { if (!m.mark) m.mark = "star"; delete m.starred; }
        if (MARKS.every(function (def) { return def.key !== m.mark; })) delete m.mark;
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
   * Write an imported project, or one from a folder manifest, into the current storage
   * mode, deciding afresh where each image lives.
   * keepPaths is for folder manifests only: those images are already in that folder, so
   * their paths must be preserved.
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
            // The export did not carry this image (it was unreadable at export time).
            // Its path belongs to another machine, and since on-disk paths are decided
            // purely by case name / model name / slot, keeping it would resolve to a
            // same-named but entirely unrelated file in the currently bound folder --
            // showing another experiment's plots as if they were this project's.
            if (!keepPaths) delete im.path;
            return;
          }
          chain = chain.then(function () {
            delete im.path;                     // re-persist according to the current mode
            return saveImageBlob(c, m, im, dataUrlToBlob(d))
              .then(function () { count++; })
              .catch(function (e) {             // one bad image must not sink the whole import
                console.error("[fml] could not restore image:", im.name, e);
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
      // The replaced project's images are unreachable now; reclaim them so old data does
      // not eat the browser quota
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
      // Wrapped in a promise so that an exception thrown synchronously inside
      // applyImportedProject still reaches the catch below. Otherwise there is no message
      // and urlCache has already been cleared, which looks like "I clicked import and
      // nothing happened".
      Promise.resolve().then(function () {
        return applyImportedProject(payload, false);
      }).then(function (n) {
        banner(t("msg.importDone", { n: n }), false);
        save();            // in folder mode the new project must reach the on-disk manifest,
                         // or the next bind reads the old one
        render();
      }).catch(function (e) { banner(t("msg.importFail", { e: errText(e) }), true); });
    };
    r.readAsText(file);
  }

  // ---------------- Storage location ----------------
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
      // An unreadable manifest must never be treated as an empty folder: the save() below
      // would overwrite it wholesale with the current (possibly empty) project, leaving
      // the images on disk as a pile of file names belonging to nothing.
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
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return;  // user cancelled
      banner(t("msg.pickFail", { e: errText(e) }), true);
    });
  }

  /**
   * Move every image into the currently bound folder.
   * There are two sources: the browser's IndexedDB, and -- when "Change folder…" is used
   * -- the previous folder. The latter must not be skipped: after a change those images
   * would be in neither the new folder nor IndexedDB (deleted long ago), while the
   * manifest still points at the old paths. The result is a screen of broken images with
   * no way back.
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
              delete im.path;                    // make saveImageBlob recompute the path for the new folder
              return saveImageBlob(c, m, im, blob).then(function () {
                moved++;
                // Only browser copies get deleted; files in the old folder are left alone
                if (!oldPath) return FMLStore.deleteBlob(im.blobId).catch(function () {});
              }).catch(function (e) {
                if (oldPath) im.path = oldPath;  // on a failed write, fall back so the reference is not lost
                failed++;
                console.error("[fml] could not migrate image:", im.name, e);
              });
            });
          });
        });
      });
    });
    return serialChain(jobs).then(function () { return { moved: moved, failed: failed }; });
  }

  /** Local folder -> browser storage (files on disk are kept) */
  function unbindFolder() {
    // Without permission not one image can be read back, yet the button sits right next
    // to the "needs re-authorisation" row. Going ahead anyway destroys the handle and
    // takes the "Restore access" button with it, leaving no way out but re-picking the
    // very same folder by hand.
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

  // ---------------- Rendering ----------------
  /** Merge src wholesale into dst: input data with the same stem is combined, and the
      models follow */
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
            // Renaming to an existing case name means merge, not two cases with one name
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
    // In folder mode ensureUrls really does read dozens or hundreds of files off disk,
    // and when that is slow the user has long since clicked another case. Without this
    // sequence number the render started first overwrites the one started later: the page
    // shows A while the tab strip highlights B, and the handlers inside A's DOM close over
    // A -- so deleting or starring acts on a case that is not the one on screen.
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

  // ---------------- Event wiring ----------------
  /* When a folder is dropped, the "directory" in dataTransfer.files is an empty shell;
     webkitGetAsEntry() is the only way to walk it and read the files inside. */
  function readDirEntries(reader) {
    var all = [];
    return new Promise(function (res, rej) {
      function next() {
        reader.readEntries(function (batch) {
          if (!batch.length) { res(all); return; }   // readEntries returns at most 100 at a
                                                     // time; keep going until it returns none
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
        console.error("[fml] could not read the dropped folder:", err);
        banner(t("msg.importFail", { e: errText(err) }), true);
      });
    });
  }

  function bind() {
    /* Dropped anywhere outside a drop zone, the browser would navigate to the file and
       replace the whole page -- banner, comparison view and all. Block it globally. */
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

    // Language toggle: refresh the static copy and everything rendered dynamically
    $("langBtn").addEventListener("click", function () {
      I18N.setLang(I18N.getLang() === "zh" ? "en" : "zh");
      banner("", false);        // the old message is in the previous language; clear it
                                // rather than mixing the two
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

  /** Refresh all static copy, including the theme button and the footer's usage figure */
  function applyI18n() {
    I18N.applyStatic();
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    $("themeBtn").textContent = dark ? t("ui.theme.toLight") : t("ui.theme.toDark");
    $("storageInfo").textContent = "";
    if (project) updateStorageInfo();
  }

  // ---------------- Startup ----------------
  try {
    var savedTheme = localStorage.getItem("fml_theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  } catch (e) {}
  I18N.initLang();
  applyI18n();

  FMLStore.init().then(function () {
    // Restore the previously bound folder. The handle itself survives in IndexedDB, but
    // the permission needs one more click from the user.
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
    // Wire events before rendering: no exception on the render path should be able to
    // leave the page dead with every button unresponsive
    bind();
    applyI18n();
    FMLStore.persisted().then(function (persistedNow) {
      persistedState = persistedNow;   // query only, never request -- no permission prompt on load
      updateStorageInfo();
    }).catch(function () {});
    try {
      reassignAll();   // older data has no inputId; fill it in here
    } catch (e) {
      console.error("[fml] re-filing failed:", e);
    }
    render();
    updateStorageInfo();
  }).catch(function (e) {
    banner(t("msg.initFail", { e: errText(e) }), true);
  });
})();
