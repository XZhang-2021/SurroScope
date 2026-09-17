/* 文件名 / 文件夹名解析器
 *
 * 例：
 *   2phase_cenX6464_20k_heter_mem20_inj1_rec10_logOn_randiSameNumPerTraj0.8_ConstantInj10_0902.mat
 *   -> prefix: "2phase_cenX6464"
 *      params: size 20k / medium heter / mem 20 / inj 1 / rec 10 / log On /
 *              sample 0.8 / injMode Constant 10 / date 09-02
 *
 *   2phase_cenX6464_20k_heter_mem40_inj1_rec10_logOn_randiSameNumPerTraj0.8_ConstantInj10_0902_L3N10_GPUResident_BS32768_NoStop
 *   -> 以上 + arch Layer3 Node10 / bs 32768 / flags GPUResident, NoStop
 *
 * 前缀（Cappa_Tmax、2phase_cenX6464 …）= 第一个能被识别的参数 token 之前的所有 token。
 */
(function (global) {
  "use strict";

  function dec(s) { return String(s).replace(/p(?=\d)/g, "."); }

  /**
   * 去掉文件扩展名。不限定 .mat —— 别人可能用 .h5 / .npz / .pkl / .pt / .csv。
   * 但扩展名必须以字母开头：否则 "...randiSameNumPerTraj0.8" 结尾的 ".8"
   * 会被当成扩展名剥掉，把采样参数弄坏。
   */
  function stripExt(s) {
    return String(s === null || s === undefined ? "" : s).replace(/\.[a-z][a-z0-9]{0,7}$/i, "");
  }

  // key: 内部键（同时是 i18n 键 param.<key>）；model: 是否属于"训练超参数"（用于和输入数据比对时忽略）
  var PATTERNS = [
    { key: "size",    re: /^N?(\d+(?:p\d+)?)k$/i,        fmt: function (m) { return dec(m[1]) + "k"; } },
    { key: "medium",  re: /^(heter|homo)$/i,             fmt: function (m) { return m[1]; } },
    { key: "mem",     re: /^mem(\d+)$/i,                 fmt: function (m) { return m[1]; } },
    { key: "inj",     re: /^inj(\d+)$/i,                 fmt: function (m) { return m[1]; } },
    { key: "rec",     re: /^rec(\d+)$/i,                 fmt: function (m) { return m[1]; } },
    { key: "log",     re: /^log(On|Off)$/i,              fmt: function (m) { return m[1]; } },
    { key: "sample",  re: /^randiSameNumPerTraj(.+)$/i,  fmt: function (m) { return dec(m[1]); } },
    { key: "injMode", re: /^(Constant|Dynamic|Random|Pattern)Inj(.*)$/i,
      fmt: function (m) { return m[1] + (m[2] ? " " + dec(m[2]) : ""); } },
    { key: "switch",  re: /^(nomal|normal|nor|zscore|maxmin|Reg|jitter)(On|Off)$/i,
      fmt: function (m) { return m[1] + " " + m[2]; }, multi: true },
    { key: "date",    re: /^(\d{4})$/,
      fmt: function (m) { return m[1].slice(0, 2) + "-" + m[1].slice(2); } },

    // ---- 训练超参数（只出现在模型文件夹名里）----
    { key: "act",     re: /^(relu|tanh|sigmoid|gelu|elu)$/i, model: true, fmt: function (m) { return m[1]; } },
    { key: "arch",    re: /^L(\d+)N(\d+)$/i, model: true,
      fmt: function (m) { return "Layer" + m[1] + " Node" + m[2]; } },
    { key: "layer",   re: /^Layer(\d+)$/i,   model: true, fmt: function (m) { return m[1]; } },
    { key: "node",    re: /^Node(\d+)$/i,    model: true, fmt: function (m) { return m[1]; } },
    { key: "bs",      re: /^BS(\d+)$/i,     model: true, fmt: function (m) { return m[1]; } },
    { key: "lr",      re: /^LR([\d p e\-]+)$/i, model: true, fmt: function (m) { return dec(m[1]); } },
    { key: "epoch",   re: /^(?:EP|Epoch)(\d+)$/i, model: true, fmt: function (m) { return m[1]; } },
    { key: "seed",    re: /^seed(\d+)$/i,    model: true, fmt: function (m) { return m[1]; } }
  ];

  function matchToken(token) {
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      var m = token.match(p.re);
      if (m) {
        return { key: p.key, value: p.fmt(m), model: !!p.model, multi: !!p.multi, raw: token };
      }
    }
    return null;
  }

  /**
   * 解析一个名字（已去掉扩展名）。
   * 返回 { raw, prefix, params:[{key,value,raw,model}], flags:[...], byKey:{} }
   */
  function parseName(rawName) {
    var name = stripExt(rawName);
    var tokens = name.split("_").filter(function (t) { return t.length > 0; });

    var firstIdx = -1;
    for (var i = 0; i < tokens.length; i++) {
      if (matchToken(tokens[i])) { firstIdx = i; break; }
    }
    // 一个参数都识别不出来时整串都当前缀。
    // 第一个 token 就是参数（20k_heter_mem20_…）时前缀为空 —— 不能硬留一个 token，
    // 那样 20k / 40k 会被当成两个不同的前缀（其实是同一个问题的两种样本量），
    // 而且被留下的那个 token 还会从参数表里消失，样本量筛选跟着失效。
    var splitAt = firstIdx < 0 ? tokens.length : firstIdx;
    var prefix = tokens.slice(0, splitAt).join("_");

    var params = [];
    var flags = [];
    var byKey = {};
    for (var j = splitAt; j < tokens.length; j++) {
      var hit = matchToken(tokens[j]);
      if (hit) {
        params.push(hit);
        if (hit.multi) {
          byKey[hit.key] = (byKey[hit.key] ? byKey[hit.key] + "," : "") + hit.value;
        } else if (byKey[hit.key] === undefined) {
          byKey[hit.key] = hit.value;
        }
      } else {
        flags.push(tokens[j]);
      }
    }

    return { raw: name, prefix: prefix, params: params, flags: flags, byKey: byKey };
  }

  /**
   * 把模型文件夹名拆成「输入数据名 + 超参数后缀」。
   *   2phase_cenX6464_20k_..._ConstantInj10_0902_L3N10
   *     -> dataset: 2phase_cenX6464_20k_..._ConstantInj10_0902   （= .mat 的名字）
   *        suffix : L3N10
   *
   * 切点：第一个"训练超参数" token（L3N10 / BS… / Layer… / seed… …）之前。
   * 名字里没有超参数 token 时，退而切在最后一个日期 token 之后，
   * 这样尾部的杂项标记（GPUResident、NoStop …）也不会算进数据集名。
   */
  function splitModelName(rawName) {
    var name = stripExt(rawName);
    var tokens = name.split("_").filter(function (t) { return t.length > 0; });

    var cut = -1;
    for (var i = 0; i < tokens.length; i++) {
      var hit = matchToken(tokens[i]);
      if (hit && hit.model) { cut = i; break; }
    }
    if (cut < 0) {
      for (var j = tokens.length - 1; j >= 0; j--) {
        if (/^\d{4}$/.test(tokens[j])) { cut = j + 1; break; }
      }
    }
    if (cut < 0) cut = tokens.length;

    return {
      dataset: tokens.slice(0, cut).join("_"),
      suffix: tokens.slice(cut).join("_")
    };
  }

  /** 数据集签名：忽略训练超参数和日期，用于把模型文件夹对上输入数据 */
  function datasetSignature(parsed) {
    var keys = Object.keys(parsed.byKey).filter(function (k) { return k !== "date" && !isModelKey(k); });
    keys.sort();
    return keys.map(function (k) { return k + "=" + parsed.byKey[k]; }).join("|");
  }

  function isModelKey(key) {
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].key === key) return !!PATTERNS[i].model;
    }
    return false;
  }

  /**
   * 比较模型和输入数据的参数差异（忽略日期与训练超参数）。
   * 返回 [{key, modelValue, inputValue}]
   */
  function diffParams(modelParsed, inputParsed) {
    var out = [];
    var keys = {};
    Object.keys(modelParsed.byKey).forEach(function (k) { keys[k] = 1; });
    Object.keys(inputParsed.byKey).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (k === "date" || isModelKey(k)) return;
      var a = modelParsed.byKey[k];
      var b = inputParsed.byKey[k];
      if (a !== b) {
        out.push({ key: k, modelValue: a, inputValue: b });
      }
    });
    return out;
  }



  global.FMLParser = {
    parseName: parseName,
    splitModelName: splitModelName,
    stripExt: stripExt,
    datasetSignature: datasetSignature,
    diffParams: diffParams,
    isModelKey: isModelKey
  };
})(window);
