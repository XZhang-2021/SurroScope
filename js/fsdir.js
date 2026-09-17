/* File System Access wrapper: writes images straight into a folder the user picks
 *
 * Layout:
 *   <the folder you picked>/
 *     fml_compare_project.json      <- metadata; this is what restores the project elsewhere
 *     <case name>/<model folder name>/traj.png
 *                                     error.png
 *
 * Note: after a browser restart the user must click "Restore access" once before the
 * folder can be read again (browser security rule).
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

  /** Characters Windows forbids in file names -> _ */
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
      .catch(function () { /* already gone is fine */ });
  }

  function writeJSON(root, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    return writeFile(root, MANIFEST, blob);
  }

  /* Return null only when the folder genuinely has no manifest.
     Present but unreadable -- a cloud placeholder that never synced, a truncated partial
     sync, broken JSON -- has to propagate: a caller that conflates the two would take a
     perfectly good manifest for an empty folder and overwrite it. */
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

  /* Windows caps a full path at 260 characters, while these model names routinely run
     past 120; appending an equally long original file name is guaranteed to overflow,
     and the browser then reports NotFoundError.
     So: over-long directory segments are truncated and given a short hash to stay unique,
     and the file name is just the slot name (the original lives in the metadata). */
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

  /** Build the on-disk path for one image */
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
