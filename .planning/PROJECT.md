# Untrunc & VideoRepair — Project Documentation

> **Restore damaged (truncated) MP4/MOV/M4V/3GP video files.**
> 
> *Project planning and task tracking documents are centralized in the `.planning/` directory.*

---

## 1. Overview

**Untrunc** is a C++17 command-line (and optional GUI) tool that repairs corrupted or truncated MP4-family video files. It works by using a *reference video* — a healthy file from the same camera/encoder — to reconstruct the damaged file's container structure (atoms, tracks, chunk offsets, sample tables) so the media can be played again.

This repository is the **anthwlock fork** of the [original ponchio/untrunc](https://github.com/ponchio/untrunc). Key improvements over the original include:

| Improvement | Detail |
|---|---|
| **Performance** | >10× faster processing |
| **Memory** | Low memory usage (fixes upstream issue #30) |
| **Large files** | Full >2 GB file support |
| **Unknown bytes** | Ability to skip/step over unknown byte sequences |
| **Codec support** | Generic fixed-width track support (twos/sowt), GoPro, Sony XAVC (RSV) |
| **Stretch/shrink** | Can stretch video to match audio duration (beta) |
| **Logging** | Advanced multi-level logging system |
| **GUI** | Optional cross-platform GUI via libui |
| **CI/CD** | Automated Windows builds (AppVeyor), Travis CI, Snapcraft, Docker |

**License:** GNU General Public License v2 (GPLv2)
**Original Author:** Federico Ponchio (2010)
**Fork Maintainer:** anthwlock

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Language | C++17 |
| Build System | GNU Make (`Makefile`), Qt Creator project file (`untrunc.pro`) |
| Core Dependency | **FFmpeg** (`libavformat`, `libavcodec`, `libavutil`) — system shared libs *or* locally compiled (e.g. FFmpeg 3.3.9) |
| Optional GUI | [libui](https://github.com/andlabs/libui) |
| Containerization | Docker (Ubuntu 22.04 base) |
| CI/CD | AppVeyor (Windows x32/x64), Travis CI (Docker), Snapcraft |

---

## 3. Directory Structure

```
videorepair/                 # Root Workspace
├── .planning/               # Centralized planning and task tracking
│   ├── PROJECT.md           # This file (Project Overview)
│   └── TASK.md              # Current task list and roadmap
├── public/                  # Web Dashboard Frontend (HackGuard Theme)
│   ├── includes/            # Modular header/footer templates
│   ├── js/                  # App logic & template engine
│   └── disclaimer.html      # Legal & Privacy page (2-column layout)
├── untrunc-master/          # Untrunc C++ Engine (anthwlock fork)
│   ├── src/                 # Engine source code
│   └── README.md            # Engine-specific documentation
├── uploads/                 # Temporary storage for repair jobs
└── server.js                # Node.js Express API & Job Orchestrator
```

---

## 4. Web Application Frontend

The project now includes a **modern web dashboard** to make the Untrunc engine accessible to non-technical users. 

### Key Features
- **Design System**: Fully responsive UI built with vanilla CSS utilizing the "HackGuard" design language (Cyber-Day Indigo, clean typography via Inter).
- **Backend Orchestrator**: A lightweight Node.js Express server (`server.js`) handles file uploads using `multer`, coordinates the C++ untrunc execution securely via `child_process.execFile`, and streams back JSON results.
- **AI Integration**: Features an "AI Repair Advisor" that automatically generates a technical brief of the user's repair intent, offering a 1-click copy-to-clipboard functionality to paste into systems like Google Gemini or ChatGPT.
- **AI SEO Excellence**: The public-facing pages (`index.html`, `disclaimer.html`) implement comprehensive AI-optimized metadata, including Open Graph tags, Twitter Cards, and `application/ld+json` Schema definitions.
- **UI & UX Defaults**: Key repair options ("Skip Unknown Sequences", "Search for mdat", "Dynamic Statistics") are enabled by default in the interface to maximize repair success rates for the average user without requiring advanced knowledge.
- **Modularity**: UI structural elements (Header, Footer) are managed as HTML fragments loaded dynamically to keep code DRY.

---

## 4. Architecture & Core Classes

### 4.1 High-Level Data Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Reference   │      │   Corrupt    │      │    Repaired      │
│  Video File  │─────▶│  Video File  │─────▶│  Video File      │
│  (ok.mp4)    │      │              │      │  (*_fixed.mp4)   │
└──────┬───────┘      └──────┬───────┘      └──────────────────┘
       │                     │
       ▼                     ▼
  ┌─────────┐          ┌──────────┐
  │ parseOk │          │  repair  │
  │         │          │          │
  │ Extract │          │ Scan raw │
  │ atoms,  │          │ mdat,    │
  │ tracks, │          │ match    │
  │ codecs, │          │ samples, │
  │ sample  │          │ rebuild  │
  │ stats   │          │ atoms    │
  └─────────┘          └──────────┘
```

### 4.2 Key Classes

| Class | File | Responsibility |
|---|---|---|
| **`Mp4`** | `mp4.h/cpp` | Central orchestrator — parses the reference file, repairs the corrupt file, rebuilds MP4 structure, writes output. Contains ~118 methods spanning 2,386 lines. This is the **heart of the application**. |
| **`Atom`** | `atom.h/cpp` | Represents an MP4 atom (box). Handles recursive parsing of the atom tree, read/write of atom content, and atom traversal. |
| **`BufferedAtom`** | `atom.h/cpp` | Subclass of `Atom` for large atoms (like `mdat`) that stream from disk rather than loading into memory. Manages exclusion sequences for skipped bytes. |
| **`Track`** | `track.h/cpp` | Represents a single media track (video, audio, etc.). Stores sample tables (`stsz`, `stco`, `stsc`, `stts`, `ctts`), chunk info, and statistical data about sample sizes. |
| **`Codec`** | `codec.h/cpp` | Wraps FFmpeg's `AVCodecParameters`/`AVCodecContext`. Provides codec-specific sample matching (`matchSample`, `matchSampleStrict`) and size detection (`getSize`). Uses function pointers to delegate to codec-specific implementations. |
| **`FileRead` / `FileWrite`** | `file.h/cpp` | Buffered file I/O with 15 MB read buffer. Handles seeking, random access via `getFragment`, and cross-platform compatibility. |
| **`MutualPattern`** | `mutual_pattern.h/cpp` | Pattern matching engine that identifies common byte patterns across samples from the same track. Used for dynamic track detection during repair. |
| **`SampleSizeStats` / `SSTats`** | `track.h` | Statistical analysis of sample sizes (min, max, avg, std-dev, z-scores, bounds). Used to validate detected samples during repair. |
| **`ChunkIt`** | `mp4.h` | Iterator over chunks across all tracks, ordered by file offset. Used during analysis and repair sequencing. |

### 4.3 Codec-Specific Modules

- **`src/avc1/`** — H.264/AVC: NAL unit parsing, slice header decoding, SPS extraction, AVC decoder configuration record parsing. Enables frame boundary detection and keyframe identification for AVC streams.
- **`src/hvc1/`** — H.265/HEVC: Similar NAL-level parsing adapted for the HEVC bitstream format.
- **Generic codecs** — Handled via `codec.cpp` with function pointers for match/size detection. Supports `twos`/`sowt` (PCM audio), and other fixed-width chunk formats.

---

## 5. Repair Algorithm (Simplified)

1. **Parse reference file** (`parseOk`): Read the atom tree, extract tracks with their codec parameters, sample tables, chunk offsets, and sample size statistics.
2. **Open corrupt file** (`repair`): Locate the `mdat` atom (raw media data).
3. **Scan `mdat` sequentially**: At each byte offset, attempt to match the raw bytes against known codec patterns from the reference file.
4. **Track identification**: Use track order patterns, chunk transitions, mutual patterns, and sample size statistics to determine which track each detected sample belongs to.
5. **Handle unknowns**: Optionally skip over unrecognized byte sequences (`-s` flag) with configurable step size.
6. **Rebuild metadata**: Reconstruct `stco`/`co64` (chunk offsets), `stsz` (sample sizes), `stsc` (sample-to-chunk), `stts` (decode timing), `ctts` (composition time), and `stss` (sync samples).
7. **Write output** (`saveVideo`): Write the repaired file with corrected atom tree as `*_fixed.mp4`.

---

## 6. CLI Usage

### Basic Repair
```bash
./untrunc /path/to/reference.mp4 /path/to/corrupt.mp4
# Output: corrupt_fixed.mp4
```

### Key Options

| Flag | Description |
|---|---|
| `-V` | Print version |
| `-s` | Step through unknown byte sequences |
| `-st <N>` | Set step size (used with `-s`) |
| `-sv` | Stretch video to match audio duration (beta) |
| `-rsv-ben` | Sony RSV recording-in-progress recovery |
| `-dw` | Don't write output file (dry run) |
| `-dr` | Dump repaired tracks |
| `-k` | Keep unknown sequences in output |
| `-sm` | Search for mdat even without MP4 structure |
| `-dcc` | Don't check if chunks are inside mdat |
| `-dyn` | Use dynamic sample statistics |
| `-range A:B` | Process only a byte range |
| `-dst <path>` | Set output destination |
| `-skip` | Skip if output already exists |
| `-noctts` | Don't restore composition time offsets |
| `-mp <bytes>` | Set max part size |

### Analysis / Info
| Flag | Description |
|---|---|
| `-a` | Analyze file structure |
| `-i` | Print media info |
| `-it` | Print track details |
| `-ia` | Print atom tree |
| `-is` | Print sample statistics |
| `-d` | Dump samples |
| `-f` | Find all atoms and check lengths |
| `-lsm` | List all mdat/moov atoms |
| `-m <offset>` | Analyze specific file offset |

### Other Operations
| Flag | Description |
|---|---|
| `-ms` | Make file streamable (move moov before mdat) |
| `-sh` | Shorten file |
| `-u <mdat> <moov>` | Unite mdat and moov fragments |

### Logging Verbosity
| Flag | Level |
|---|---|
| `-q` | Quiet (errors only) |
| *(default)* | Normal (info + warnings + errors) |
| `-w` | Show hidden warnings |
| `-v` | Verbose |
| `-vv` | Very verbose |

---

## 7. Build Instructions

### macOS (Homebrew)
```bash
brew install ffmpeg yasm
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig"
CPPFLAGS="-I/opt/homebrew/include" LDFLAGS="-L/opt/homebrew/lib" make
```

### Linux (System Libraries)
```bash
sudo apt-get install libavformat-dev libavcodec-dev libavutil-dev
make
```

### Linux (Local FFmpeg)
```bash
sudo apt-get install yasm wget
make FF_VER=3.3.9
```

### Docker
```bash
docker build -t untrunc .
docker run --rm -v ~/Videos/:/mnt untrunc /mnt/ok.mp4 /mnt/broken.mp4
```

### GUI Build
```bash
# Requires libui installed
make untrunc-gui
```

### Windows
Pre-built releases available on [GitHub Releases](https://github.com/anthwlock/untrunc/releases/latest). CI builds are automated via AppVeyor for both x32 and x64.

---

## 8. Supported Formats

| Container | Extensions |
|---|---|
| MPEG-4 Part 14 | `.mp4`, `.m4v`, `.m4a` |
| QuickTime | `.mov` |
| 3GPP | `.3gp` |

| Video Codecs | Audio Codecs |
|---|---|
| H.264/AVC (`avc1`) | AAC |
| H.265/HEVC (`hvc1`) | PCM (`twos`/`sowt`) |
| GoPro proprietary | AMR-WB (`sawb`) |
| Sony XAVC | Various via FFmpeg |

---

## 9. Global Configuration Flags

The application uses a set of global boolean/integer flags (defined in `common.h`) to control behavior at runtime. These are set from CLI arguments in `main.cpp`:

| Flag | Default | Purpose |
|---|---|---|
| `g_log_mode` | `I` (Info) | Logging verbosity level |
| `g_interactive` | `true` | Allow interactive prompts |
| `g_ignore_unknown` | `false` | Step over unknown sequences (`-s`) |
| `g_stretch_video` | `false` | Stretch video duration to match audio |
| `g_dont_write` | `false` | Skip writing output file |
| `g_use_chunk_stats` | `false` | Use dynamic chunk statistics |
| `g_dont_exclude` | `false` | Keep unknown sequences |
| `g_rsv_ben_mode` | `false` | Sony RSV recovery mode |
| `g_dump_repaired` | `false` | Dump repaired tracks |
| `g_search_mdat` | `false` | Search for mdat in damaged structure |
| `g_no_ctts` | `false` | Skip CTTS restoration |
| `g_skip_existing` | `false` | Skip if output file exists |
| `g_off_as_hex` | `true` | Display offsets in hex |
| `g_fast_assert` | `false` | Exit on assert instead of abort |

---

## 10. File Size Summary

| Component | Lines of Code |
|---|---|
| Core (`src/*.cpp` + `src/*.h`) | ~6,800 |
| AVC1 module (`src/avc1/`) | ~1,200 |
| HVC1 module (`src/hvc1/`) | ~800 |
| GUI module (`src/gui/`) | ~560 |
| **Total Source** | **~9,360** |
| Makefile | 185 |
| Dockerfile | 36 |
| CI configs | ~100 |

---

## 11. Key Technical Notes

1. **Singleton-like pattern**: A global `Mp4*` pointer (`g_mp4`) provides access to the main `Mp4` instance from anywhere. The comment in `main.cpp` acknowledges this is a pragmatic choice over a formal singleton.

2. **FFmpeg version compatibility**: The build system supports multiple FFmpeg versions (3.3.9 through 6.0) with `make FF_VER=X.Y`. The code includes version-conditional compilation (e.g. `nb_channels` macro for channel layout API changes in FFmpeg 5.x+).

3. **Memory efficiency**: Large atoms (especially `mdat`) use `BufferedAtom` which streams from disk with a 15 MB read buffer rather than loading the entire content into memory.

4. **Pattern matching**: The `MutualPattern` class identifies common byte patterns across multiple samples of the same track. This enables "dynamic" track detection when the track interleaving is not perfectly predictable.

5. **Statistical validation**: `SampleSizeStats` computes running statistics (Welford's online algorithm for variance) on sample sizes from the reference file. During repair, candidate samples are validated against these statistical bounds (z-scores, upper/lower limits).

6. **Cross-platform**: Includes Windows-specific UTF-8 argv handling, macOS `iconv` linking, and POSIX-standard file I/O elsewhere.
