/* Parser for file and folder names
 *
 * Example:
 *   2phase_cenX6464_20k_heter_mem20_inj1_rec10_logOn_randiSameNumPerTraj0.8_ConstantInj10_0902.mat
 *   -> prefix: "2phase_cenX6464"
 *      params: size 20k / medium heter / mem 20 / inj 1 / rec 10 / log On /
 *              sample 0.8 / injMode Constant 10 / date 09-02
 *
 *   2phase_cenX6464_20k_heter_mem40_inj1_rec10_logOn_randiSameNumPerTraj0.8_ConstantInj10_0902_L3N10_GPUResident_BS32768_NoStop
 *   -> the above + arch Layer3 Node10 / bs 32768 / flags GPUResident, NoStop
 *
 * The prefix (Cappa_Tmax, 2phase_cenX6464 …) is every token before the first token
 * that parses as a parameter.
 */
(function (global) {
  "use strict";

  function dec(s) { return String(s).replace(/p(?=\d)/g, "."); }

  /**
   * Strip the file extension. Not limited to .mat -- people also use
   * .h5 / .npz / .pkl / .pt / .csv.
   * The extension must start with a letter though: otherwise the ".8" ending
   * "...randiSameNumPerTraj0.8" gets stripped as an extension, breaking the sampling parameter.
   */
  function stripExt(s) {
    return String(s === null || s === undefined ? "" : s).replace(/\.[a-z][a-z0-9]{0,7}$/i, "");
  }

  // key: the internal key, which doubles as the i18n key param.<key>
  // model: true for training hyperparameters, which are ignored when comparing with input data
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

    // ---- Training hyperparameters (only ever appear in model folder names) ----
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
   * Parse a name (extension already stripped).
   * Returns { raw, prefix, params:[{key,value,raw,model}], flags:[...], byKey:{} }
   */
  function parseName(rawName) {
    var name = stripExt(rawName);
    var tokens = name.split("_").filter(function (t) { return t.length > 0; });

    var firstIdx = -1;
    for (var i = 0; i < tokens.length; i++) {
      if (matchToken(tokens[i])) { firstIdx = i; break; }
    }
    // Nothing recognised at all -> the whole string is the prefix.
    // When the very first token is already a parameter (20k_heter_mem20_…) the prefix is
    // empty, and we must not force one token to stay: that would turn 20k / 40k into two
    // different prefixes (they are two sample sizes of the same problem), and the token
    // kept as the prefix would vanish from the parameter table, breaking its filter.
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
   * Split a model folder name into "input data name + hyperparameter suffix".
   *   2phase_cenX6464_20k_..._ConstantInj10_0902_L3N10
   *     -> dataset: 2phase_cenX6464_20k_..._ConstantInj10_0902   (= the .mat name)
   *        suffix : L3N10
   *
   * The cut goes just before the first training-hyperparameter token
   * (L3N10 / BS… / Layer… / seed… …). When the name has none, it falls back to just after
   * the last date token, so trailing odds and ends (GPUResident, NoStop …) stay out of
   * the dataset name.
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

  /** Dataset signature: ignores training hyperparameters and the date. Used to match a
      model folder to its input data. */
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
   * Diff a model's parameters against its input data's (date and training
   * hyperparameters excluded).
   * Returns [{key, modelValue, inputValue}]
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
