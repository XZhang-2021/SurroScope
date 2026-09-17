/* IndexedDB 封装：项目元数据 + 图片 Blob
 *
 * 说明：图片以 Blob 原样存进 IndexedDB（不转 base64，省空间）。
 * 实测 Chrome 在 file:// 下可用；若浏览器禁用了 IndexedDB，init() 会 reject，
 * 由 app.js 显示提示。
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
        reject(new Error("此浏览器不支持 IndexedDB"));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
        if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS);
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB 打开失败")); };
      req.onblocked = function () { reject(new Error("IndexedDB 被其他标签页占用，请关掉其他页面重试")); };
    });
  }

  function tx(store, mode) {
    if (!db) throw new Error("IndexedDB 尚未初始化");
    return db.transaction(store, mode).objectStore(store);
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /* db.transaction() 是同步抛异常的（数据库没开、被关掉、配额爆了都会抛）。
     直接 wrap(tx(...).put(...)) 的话这个异常会穿过调用方的 .catch()，
     结果就是"保存失败了但界面上什么都没发生"。统一在这里转成 rejected promise。 */
  function run(store, mode, fn) {
    try { return wrap(fn(tx(store, mode))); }
    catch (e) { return Promise.reject(e); }
  }

  function loadProject() { return run(KV, "readonly", function (s) { return s.get("project"); }); }

  function saveProject(project) {
    return run(KV, "readwrite", function (s) { return s.put(project, "project"); });
  }

  /* 通用键值：用来存 FileSystemDirectoryHandle（可被结构化克隆，能直接存进 IndexedDB） */
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

  /** 删除项目里已经引用不到的图片，避免占空间 */
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

  /* 默认的浏览器存储是"尽力保存"级别：磁盘紧张时浏览器有权直接回收。
     申请持久化能大幅降低被回收的概率。Chrome 按站点活跃度静默决定，
     Firefox 会弹权限框——所以调用时机要挑在用户真的开始存东西之后。 */
  function persisted() {
    if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted();
    return Promise.resolve(null);      // null = 浏览器不支持，别当成"未持久化"来吓人
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
