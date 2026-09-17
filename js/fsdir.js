/* File System Access 封装：把图片直接写进用户自选的本地文件夹
 *
 * 目录结构：
 *   <你选的文件夹>/
 *     fml_compare_project.json      ← 元数据（换电脑时靠它恢复）
 *     <case 名>/<模型文件夹名>/traj-xxx.png
 *                              error-xxx.png
 *
 * 注意：浏览器重启后文件夹权限需要用户再点一次「恢复访问」（浏览器安全限制）。
 */
(function (global) {
  "use strict";

  var MANIFEST = "fml_compare_project.json";

  function supported() {
    return typeof global.showDirectoryPicker === "function";
  }

  function pick() {
    return global.showDirectoryPicker({ mode: "readwrite", id: "fml-compare-library" });
  }

  function queryPermission(handle) {
    if (!handle || !handle.queryPermission) return Promise.resolve("granted");
    return handle.queryPermission({ mode: "readwrite" });
  }

  function requestPermission(handle) {
    if (!handle || !handle.requestPermission) return Promise.resolve("granted");
    return handle.requestPermission({ mode: "readwrite" });
  }

  /** Windows 文件名非法字符 -> _ */
  function safeName(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/[\x00-\x1f]/g, "")
      .replace(/^\.+/, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 120) || "_";
  }

  function dirFor(root, parts, create) {
    return parts.reduce(function (p, seg) {
      return p.then(function (d) { return d.getDirectoryHandle(seg, { create: !!create }); });
    }, Promise.resolve(root));
  }

  function splitPath(path) {
    var parts = path.split("/").filter(Boolean);
    return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
  }

  function writeFile(root, path, blob) {
    var sp = splitPath(path);
    return dirFor(root, sp.dirs, true)
      .then(function (d) { return d.getFileHandle(sp.name, { create: true }); })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) {
        return Promise.resolve(w.write(blob)).then(function () { return w.close(); });
      });
  }

  function readFile(root, path) {
    var sp = splitPath(path);
    return dirFor(root, sp.dirs, false)
      .then(function (d) { return d.getFileHandle(sp.name, { create: false }); })
      .then(function (fh) { return fh.getFile(); });
  }

  function deleteFile(root, path) {
    var sp = splitPath(path);
    return dirFor(root, sp.dirs, false)
      .then(function (d) { return d.removeEntry(sp.name); })
      .catch(function () { /* 文件已不在就算了 */ });
  }

  function writeJSON(root, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    return writeFile(root, MANIFEST, blob);
  }

  /* 只有"文件夹里本来就没有清单"才返回 null。
     读得到但读不出来（云盘占位文件没同步下来、同步到一半被截断、JSON 坏了）必须往上抛：
     调用方要是把这两种情况混为一谈，就会把一份好好的清单当成空文件夹覆盖掉。 */
  function readJSON(root) {
    return readFile(root, MANIFEST)
      .catch(function (e) {
        if (e && e.name === "NotFoundError") return null;
        throw e;
      })
      .then(function (f) {
        if (!f) return null;
        return f.text().then(function (txt) { return JSON.parse(txt); });
      });
  }

  /* Windows 单条路径上限 260 字符，而这些模型名动辄 120+ 字符，
     再拼上同样长的原始文件名就必然超限（浏览器会报 NotFoundError）。
     所以：目录名超长就截断 + 加短哈希保证唯一，文件名只用槽位名（原名另存在元数据里）。 */
  var MAX_SEG = 100;

  function hash5(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 5);
  }

  function shortSeg(s) {
    var safe = safeName(s);
    if (safe.length <= MAX_SEG) return safe;
    return safe.slice(0, MAX_SEG - 6) + "~" + hash5(String(s));
  }

  function extOf(fileName) {
    var m = String(fileName).match(/\.[a-z0-9]{1,6}$/i);
    return m ? m[0].toLowerCase() : "";
  }

  /** 为一张图片生成落盘路径 */
  function imagePath(caseName, modelFolder, slot, fileName, unique) {
    var base = safeName(slot) + (unique ? "-" + safeName(unique) : "") + extOf(fileName);
    return shortSeg(caseName) + "/" + shortSeg(modelFolder) + "/" + base;
  }

  global.FMLDir = {
    supported: supported,
    pick: pick,
    queryPermission: queryPermission,
    requestPermission: requestPermission,
    writeFile: writeFile,
    readFile: readFile,
    deleteFile: deleteFile,
    writeJSON: writeJSON,
    readJSON: readJSON,
    imagePath: imagePath,
    safeName: safeName,
    MANIFEST: MANIFEST
  };
})(window);
