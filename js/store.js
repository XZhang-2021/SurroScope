/* IndexedDB wrapper: project metadata + image blobs
 *
 * Images go in as blobs as-is, not base64, which would waste space.
 * Verified to work in Chrome under file://. If the browser has IndexedDB disabled,
 * init() rejects and app.js surfaces the message.
 */
(function (global) {
  "use strict";

  var DB_NAME = "fml_compare";
  var DB_VERSION = 1;
  var KV = "kv";
  var BLOBS = "blobs";
  var db = null;

  function init() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("This browser does not support IndexedDB"));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
        if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS);
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function () { reject(req.error || new Error("Could not open IndexedDB")); };
      req.onblocked = function () { reject(new Error("IndexedDB is held by another tab - close the other pages and retry")); };
    });
  }

  function tx(store, mode) {
    if (!db) throw new Error("IndexedDB is not initialised yet");
    return db.transaction(store, mode).objectStore(store);
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /* db.transaction() throws synchronously: database not open, closed, quota exceeded …
     With a bare wrap(tx(...).put(...)) that exception sails straight past the caller's
     .catch(), so a failed save shows nothing whatsoever in the UI.
     Every access goes through here, which turns it into a rejected promise instead. */
  function run(store, mode, fn) {
    try { return wrap(fn(tx(store, mode))); }
    catch (e) { return Promise.reject(e); }
  }

  function loadProject() { return run(KV, "readonly", function (s) { return s.get("project"); }); }

  function saveProject(project) {
    return run(KV, "readwrite", function (s) { return s.put(project, "project"); });
  }

  /* Generic key-value store. Used for the FileSystemDirectoryHandle, which is
     structured-cloneable and so can live in IndexedDB directly. */
  function kvGet(key) { return run(KV, "readonly", function (s) { return s.get(key); }); }
  function kvSet(key, value) { return run(KV, "readwrite", function (s) { return s.put(value, key); }); }
  function kvDel(key) { return run(KV, "readwrite", function (s) { return s.delete(key); }); }

  function putBlob(id, blob, meta) {
    return run(BLOBS, "readwrite", function (s) {
      return s.put({ blob: blob, meta: meta || {} }, id);
    });
  }

  function getBlob(id) { return run(BLOBS, "readonly", function (s) { return s.get(id); }); }

  function deleteBlob(id) { return run(BLOBS, "readwrite", function (s) { return s.delete(id); }); }

  function allBlobKeys() { return run(BLOBS, "readonly", function (s) { return s.getAllKeys(); }); }

  /** Delete images the project no longer references, so they stop taking up space */
  function gc(project) {
    var used = {};
    (project.cases || []).forEach(function (c) {
      (c.models || []).forEach(function (m) {
        (m.images || []).forEach(function (img) { used[img.blobId] = 1; });
      });
    });
    return allBlobKeys().then(function (keys) {
      var dead = keys.filter(function (k) { return !used[k]; });
      return Promise.all(dead.map(deleteBlob)).then(function () { return dead.length; });
    });
  }

  function estimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
    return Promise.resolve(null);
  }

  /* Browser storage is "best effort" by default: the browser may evict it when disk runs
     low. Requesting persistence makes that far less likely. Chrome decides silently from
     site engagement, Firefox shows a permission prompt -- which is why this is called only
     once the user actually starts storing something. */
  function persisted() {
    if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted();
    return Promise.resolve(null);      // null = unsupported; do not report that as "not persisted" and alarm people
  }

  function persist() {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    return Promise.resolve(null);
  }

  global.FMLStore = {
    init: init,
    loadProject: loadProject,
    saveProject: saveProject,
    kvGet: kvGet,
    kvSet: kvSet,
    kvDel: kvDel,
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    allBlobKeys: allBlobKeys,
    gc: gc,
    estimate: estimate,
    persisted: persisted,
    persist: persist
  };
})(window);
