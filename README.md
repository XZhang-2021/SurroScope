# SurroScope

**Surrogate model result comparison board** — a pure front-end dashboard that organises results as
**case → input data → model** and puts every model's trajectory and error plots side by side.

Double-click `index.html`. No server, no Python, no network, no dependencies.

> **SurroScope does not plot anything.** It organises and displays images you have already rendered.
> Produce the trajectory and error plots yourself (MATLAB, Python, whatever you use), save them as
> image files inside each model's result folder, and name them so the board can tell them apart —
> see [step 2](#2-drop-in-your-result-folders). No raw data, predictions or metrics are ever read from
> your files.

---

# Part 1 · Quick start

### 1. Open it

Double-click `index.html`. Click `中文 / English` in the top-right to switch language (remembered;
first open follows your browser).

### 2. Drop in your result folders

**First, make sure each folder already contains the finished plots**, saved as `png` / `pdf` / `svg`
/ `jpg`, with a name that says which kind of plot it is:

| Name contains | Filed as |
|---|---|
| `traj` / `轨迹` / `compare` / `pred` | Trajectory plot |
| `err` / `error` / `误差` / `hist` | Error plot |
| anything else | Other |

`traj.png` and `error.png` are enough. Nothing is drawn or computed for you — a folder without images
still imports, but has nothing to compare (you can add images to its slots by hand later).

Then drag your model result folders into the **third box (the blue one)** — that is all you need.
Drop **many folders at once**, or just drop the **parent folder** (e.g. `report_0909`) and every
subfolder becomes a model.

```
report_0909/
  2phase_cenX6464_20k_..._ConstantInj10_0902_L3N10/          ← drag this,
    traj.png                                                 ← your plots, already rendered
    error.png
  2phase_cenX6464_20k_..._ConstantInj10_0902_L5N20_BS32768/  ← or just drag report_0909
    traj.png
    error.png
```

From each folder name the board works out three things by itself:

| Source | Result |
|---|---|
| The part before the first hyperparameter (`_L3N10`) | The input data it belongs to |
| The whole folder name | The model name |
| The images inside | Trajectory plot / error plot |

So you end up with this, sorted automatically:

```
Case: 2phase_cenX6464
 ├─ Input data ..._mem20_inj1_rec10_..._0902.mat        (2 models)
 │    ├─ Model ..._0902_L3N10
 │    └─ Model ..._0902_L5N20_BS32768
 └─ Input data ..._mem40_inj1_rec10_..._0902.mat        (1 model)
      └─ Model ..._0902_L3N10_GPUResident_BS32768_NoStop
```

Only names are read from the folders — the images are the only thing stored.

### 3. Compare

Scroll to **Comparison**, tick the models you want.

- **Group by plot type** (the default layout) puts every model's error plot in one row, every
  trajectory plot in another — this is the view you will use most.
- Switch plot types on and off, or filter by `Samples` / `mem` / `inj` / `rec` / … to narrow the set.
- Click any image to enlarge; `←` `→` to page, `Esc` to close.

A **sticky nav bar** sits at the top of the page and follows you down it:

```
Storage location │ Cases │ Data / models │ Comparison │ Jump to dataset… ▾ │ ↑ Top
```

Click a section to jump to it; whichever section you are in is highlighted. The data section is the
long one, so there is also a **Jump to dataset…** picker that lands directly on one `.mat`'s group
(hidden when there is only one dataset).

### 4. Mark what you have judged

Each model name carries one picker; whichever mark you choose is the one it shows:

| Option | Meaning | Limit |
|---|---|---|
| `— unmarked` | not looked at yet | — |
| `★ best` | the **best** model for this dataset | **one per input dataset** — starring another clears the previous star |
| `👍 good` | result looks right | any number |
| `👎 poor` | result is off, no need to revisit | any number |

A mark belongs to **one model** and a model carries at most one, so marking a model you had thumbed
up as best replaces the thumb. Marks are synced everywhere — card tint, both comparison layouts and
the comparison filter chips. They are saved with the project. (The dataset header shows only
`★ best <model>`; it does not count how many are good or poor.)

The comparison filter gains a **Mark** row (`★ best` / `👍 good` / `👎 poor` / `unmarked`), each
toggled on its own — which is what the marks are for: judge once, then filter the poor ones out of
the comparison in a click. The row is hidden while everything in the case carries the same mark.

> A picker rather than a button that cycles on each click: the star is exclusive per dataset, so
> cycling `👎` back to unmarked would have to pass through `★` and would silently steal another
> model's star.

### 5. Keep your results (recommended)

By default images go into browser storage, which is lost if you change machine or clear browser data.
For anything you want to keep, use **Storage location** at the top of the page →
**"Choose a local folder…"** (Chrome / Edge). Images are then written as real files you can sync or
back up, with no size cap.

That is the whole workflow. Everything below is reference.

---

# Part 2 · Reference

- [What it reads and stores](#what-it-reads-and-stores)
- [Uploading data and models separately](#uploading-data-and-models-separately)
- [How models get filed](#how-models-get-filed)
- [The comparison view in detail](#the-comparison-view-in-detail)
- [Colours, collapsing, deleting](#colours-collapsing-deleting)
- [If your naming convention is different](#if-your-naming-convention-is-different)
- [The naming convention that is auto-recognised](#the-naming-convention-that-is-auto-recognised)
- [Diagnosing a failed import](#diagnosing-a-failed-import)
- [Image formats](#image-formats)
- [Storage in detail](#storage-in-detail)
- [Browser requirements](#browser-requirements)
- [File layout](#file-layout)

## What it reads and stores

| | What happens |
|---|---|
| Input data `.mat` | **Only the file name is extracted** — contents are never read or stored |
| Model folder | **Only the folder name and the file structure (names + sizes)** — contents are not read |
| Result images | **Stored** (browser IndexedDB, or a local folder) for side-by-side comparison |

The board never opens a `.mat`, never runs a model and never draws a plot. Every image it shows is one
you rendered and saved beforehand; its whole job is to name, sort and line them up.

## Uploading data and models separately

The quick start uses the third box, which does everything at once. The first two boxes let you do it
in two steps instead:

1. **Input data first**: drag `.mat` files into the left box (multi-select allowed). Cases are created
   from the file name prefix — `2phase_cenX6464_20k_heter_mem40_..._0902.mat` goes into the case
   `2phase_cenX6464`, with a group of its own inside it.

2. **Model folders next**: drag them into the middle box. They are filed under the matching input
   data, exactly as in the quick start.

Input data created by the quick-start route is marked **inferred**. Uploading the real `.mat` later
merges into the same entry and clears the mark.

Both the middle and the blue box accept batch drops (many folders, or one parent folder). A dropped
folder is treated as one model when the plots sit directly inside it, and as a container when its
subfolders are the model folders — so `report_0909` is expanded, and a model folder with
`checkpoints/` or `logs/` beside its plots is not. Intermediate directories (`runs/2026-09/<model>/`)
are walked through.

> File formats other than `.mat` work fine — `.h5` / `.npz` / `.pkl` / `.csv` — since only the name is read.

**Re-importing the same folder is safe, and is the intended way to update.** An image whose name is
already stored is compared **by file modification time**: changed means replace, unchanged means
skip — no rewrite, no piling up of duplicates. So after retraining a few models, just drop the whole
parent folder again; the banner says what was updated and what was left alone:

```
Batch import done: 8 folders, 2 images. (14 unchanged image(s) skipped)
Checked 8 folders, nothing to update — all 16 image(s) unchanged.
```

Older files are skipped too, so re-importing a stale copy cannot overwrite a newer result. Picking or
dropping a file into an image slot by hand always applies — that rule covers folder imports only.

## How models get filed

The data parameters in the model name (mem / inj / rec / sampling / injection …, ignoring dates and
training hyperparameters) are matched against the input data, and the model is attached to an
**exact** match.

mem / inj / rec and friends are **each an independent variable**, so "one parameter off" means it
belongs to **a different dataset** — the model is never forced onto the nearest one. With no exact
match, its own input data is inferred from the model name.

Only when you **manually** attach a model to input data whose parameters disagree are the differences
listed in red on the card: `⚠ Differs from input data “…_rec1_…”: rec 10 ↔ 1`. Dates and training
hyperparameters are excluded from the comparison — a folder date one or two days off from the data
date is perfectly normal.

To change an assignment, use the dropdown in the top-right of the model card; it lists every input
data of every case. Once set manually, automatic filing no longer overrides it.

**Where the split point is**: the **first training-hyperparameter token** (`L3N10` / `Layer3` / `BS…` /
`relu` / `seed…` …). If the name has no hyperparameters, the split falls after the last date token.

**How images are classified**: a file name containing `traj`/`轨迹`/`compare`/`pred` → trajectory plot;
`err`/`error`/`误差`/`hist` → error plot; everything else → "Other". Only the **distinguishing
fragment** is inspected — the repeated folder-name prefix is stripped first, and anything still
matching a token of the folder name is removed before the keywords are applied. So
`<model name>_error.png` is filed as an error plot even when the model name itself contains
`randiSameNumPerTraj` or `pred`.
You can also click or drag into any image slot to upload, replace or delete manually.

## The comparison view in detail

- **Plot type** (first item in the filter bar): `Trajectory plot` / `Error plot` / `Other` are three
  independent switches (all on by default). This applies in both layouts, and lightbox paging only
  steps through the visible images. The row is hidden when there is only one type.
- **Parameter filters**: `Samples` / `mem` / `inj` / `rec` / `log` / `Sampling` — each lists the values
  present in the current case as clickable tags; switching a value off removes the matching models.
  `All` selects everything, `Reset filters` restores the defaults. Only parameters with more than one
  value in the current case are listed.
- **Model checkboxes**: grouped by input data, so it is obvious which models share a dataset; models
  removed by the filters do not appear. Names show only the hyperparameters (`Layer3 Node10`); when
  several models share the same ones, the fewest extra parameters needed to tell them apart are
  appended — `Layer3 Node10 (Samples 20k, mem 40, rec 1)`.
- **Layouts**: *Group by plot type* (same kind of plot per row) or *One row per model*.

## Colours, collapsing, deleting

Each input data has **its own colour scheme** (left colour bar + group background, cycling through 6),
so it is obvious at a glance which models belong to the same `.mat`. The dot in front of each group in
the comparison area uses the same colour.

With many images the page gets long: the `▾` left of a model title collapses that model, and
"Collapse all / Expand all" in the top-right handles every model in the current case. The state is
remembered. Card thumbnails are height-capped — open the large view for detail.

**Deleting an input data** that still has models opens a dialog:

- **Keep them (become unassigned)** — models and images move to the "Unassigned models" group, to be
  re-assigned later with the dropdown. They are marked *user-designated unassigned*, so automatic
  filing does not immediately re-infer the dataset you just deleted.
- **Delete them too (N)** — data, models and images all go.
- **Cancel**

## If your naming convention is different

The board **does not require** any particular scheme. When parameters are not recognised it falls back
to a generic rule and still works:

| | Recognised naming | Unrecognised naming |
|---|---|---|
| How cases are split | The part before the first parameter token | **The first token of the name** (`airfoil_gp_rbf` → `airfoil`) |
| If there is no such part | Names starting with a parameter (`20k_heter_…`) all land in one case named `default` — rename it or merge it | — |
| Input data | Matched exactly by parameter signature | Inferred from the model folder name; identical names merge |
| Parameter labels | Recognised individually and filterable | Shown verbatim as dashed tags; comparison is unaffected |

Example: drop `airfoil_gp_rbf`, `airfoil_gp_matern`, `airfoil_nn_3x64`, `burgers_fno_w32` and
`burgers_deeponet_b128` in together → two cases, **airfoil** (3 models) and **burgers** (2 models),
each internally comparable.

If the grouping is not what you want:

- **Double-click a case name to rename it**; renaming it to an **existing case name** merges the two
- The **"Merge case…"** button in the top-right moves a whole case into another (data, models, images
  and marks come along)
- A single model can be moved to any input data of any case via the dropdown on its card

## The naming convention that is auto-recognised

The prefix (`Cappa_Tmax`, `2phase_cenX6464` …) is everything before the first recognisable parameter,
and becomes the case name. The rest is recognised token by token:

| Example | Recognised as |
|---|---|
| `20k` / `3p5k` / `N1p5k` | Samples 20k / 3.5k / 1.5k |
| `heter` / `homo` | Medium |
| `mem20` `inj1` `rec10` | mem / inj / rec |
| `logOn` | log On |
| `randiSameNumPerTraj0.8` | Sampling 0.8 |
| `ConstantInj10` / `DynamicInj` / `ConstantInj0p8dynamic` | Injection (`p` is restored to a decimal point) |
| `0902` | Date 09-02 |
| `L3N10` / `Layer3` / `Node10` | Network ← training hyperparameter, highlighted blue |
| `BS32768` / `LR…` / `EP…` / `seed…` | BatchSize / LR / Epochs / seed |
| Anything unrecognised (`GPUResident`, `NoStop` …) | Shown verbatim as a dashed tag |

## Diagnosing a failed import

Chrome's `A URI supplied to the API was malformed, or the resulting Data URL has exceeded the URL
length limitations for Data URLs.` is its generic wording for **SyntaxError** and says nothing specific
on its own (it usually has nothing to do with Data URL length).

A failed import tells you **which file** failed and **what kind of error** it was, and **one failing
file no longer aborts the batch**:

```
Imported 9 folders / 17 images; 1 item(s) failed (press F12 for details in the console).
“..._L3N10/error_hist.png” failed: SyntaxError: A URI supplied to the API was ...
```

Full stack traces are in the Console under `F12`, prefixed with `[fml]`.

**Most common cause — the path is too long.** Windows caps a full path at **260 characters**; beyond
that the browser cannot open the file (`NotFoundError`). Repeating the folder name inside the file
name makes this easy to hit:

```
C:/Users/you/Desktop/report_0909/2phase_cenX6464_20k_..._BS32768_NoStop/
                                 2phase_cenX6464_20k_..._BS32768_NoStop_error.png
                                                             ← 292 characters in total ✗
```

Either fix works: move the folder somewhere shorter (`C:/r9/`), or **shorten the file names** —
`traj.png` / `error.png` is enough, the folder already says which model it is. (When the board writes
images into a local folder itself, path lengths are already capped.)

**Other possibilities**: the file is still a **cloud placeholder** in Box and has not synced locally
(open it once in File Explorer to force the download), or it is corrupt, or you lack read permission.

## Image formats

**Supported**: raster `png` `apng` `jpg` `jfif` `webp` `avif` `gif` `bmp` `ico`; vector `svg`/`svgz`
(lossless zoom, auto-fitted) and `pdf` (the browser's built-in viewer).

**Not supported**: `.fig` `.eps` `.tif/.tiff` `.emf` `.ai` `.psd` — browsers cannot render them.
In MATLAB, use `exportgraphics`:

```matlab
exportgraphics(fig, 'traj.png', 'Resolution', 300);   % raster
exportgraphics(fig, 'traj.pdf', 'ContentType','vector');  % vector, lossless zoom
```

If no image at all is recognised on upload, the message bar says why (unsupported format, or no images
in the folder) and lists what the folder actually contains.

## Storage in detail

### Browser storage (default)

Images live in IndexedDB — works out of the box, no permission needed. The footer shows `X / Y used`
(measured: Chrome grants **10 GB** under `file://`, roughly 30,000 images of 300 KB).

- **It can be evicted**: browser storage is "best effort" by default and may be cleared when disk space
  runs low. The first time images are stored the board requests **persistent storage** to reduce the
  chance, and shows the outcome in the footer. If it says *not persisted*, bind a local folder or
  export regularly for anything important.
- **It follows the browser**: switching machines or browsers, or clearing browser data, loses it.

If it does fill up, the message bar tells you what to do rather than throwing a bare
`QuotaExceededError` at you.

### Local folder (recommended for the long run)

**"Choose a local folder…"** writes images to disk as **real files** — no size cap, no browser
eviction, openable and syncable from File Explorer:

```
your folder/
  fml_compare_project.json                ← metadata manifest
  2phase_cenX6464/                        ← case name
    2phase_cenX6464_..._L3N10_BS32768/    ← model folder name
      traj.png                            ← one file per slot, so re-importing
      error.png                             the same folder just overwrites it
      other-a1b2.png                      ← "Other" holds many, hence the suffix
```

Very long case or model names are shortened with a short hash so the path stays within
the Windows limit; the original names live in the manifest.

- Only the images are on disk; metadata (cases / models / parameters) still lives in the browser (a few
  dozen KB) and is mirrored to `fml_compare_project.json` for recovery.
- Switching to folder mode **migrates** images already in the browser automatically, and every later
  change updates the manifest.
- **Moving to another machine**: sync the folder over → open the board there → "Choose a local
  folder…" → pick it → it reports "this folder already contains project data"; choose **OK** to restore.
- Switch back any time with "Switch to browser storage": images are copied back and **the files on disk
  are kept**.
- Browser security rule: **every time you reopen the page** you must click "Restore access" once before
  images can display. The folder path itself is remembered.

### Export / import

**"Export project" / "Import project"** in the top-right pack everything, images included, into a
single `.json` file — for sending to someone else or as a snapshot backup. Works in both modes.

## Browser requirements

| Feature | Chrome / Edge | Firefox / Safari |
|---|---|---|
| All core features (upload, comparison, marks, browser storage) | ✓ | ✓ |
| **Binding a local folder** (images as real files) | ✓ | ✗ no File System Access API |

On Firefox / Safari, "Storage location" falls back to browser storage and says so; use
"Export project / Import project" for cross-machine syncing. **Chrome or Edge recommended.**

## File layout

```
index.html      Page structure (static copy annotated with data-i18n)
app.css         Styles (dark mode included)
js/i18n.js      English/Chinese string tables + switching logic
js/parser.js    File- and folder-name parser (emits keys only; display names come from i18n)
js/store.js     IndexedDB wrapper (metadata + image blobs)
js/fsdir.js     Local folder read/write (File System Access API)
js/app.js       Main logic (cases / uploads / image slots / comparison / lightbox / storage switching / import-export)
```

To add a string: add one line to each of the `zh` and `en` dictionaries in `js/i18n.js`; mark static
text in the HTML with `data-i18n="your.key"`, and use `t("your.key", {var: value})` in JS for dynamic text.
