# Artifact Playbooks

Three workflows for common use cases. Copy-paste ready.

## 1. Curate an Org from Scratch

Generate a catalog of signature artifacts across an entire GitHub org, then publish it as a browsable wall.

```bash
# First-run setup (once)
artifact init
artifact doctor

# Crawl every repo in the org
artifact crawl --org my-org --format html

# Publish the catalog to GitHub Pages
artifact publish --pages-repo my-org/artifact-wall

# Or do it all in one shot
artifact crawl --org my-org --format html --publish --pages-repo my-org/artifact-wall
```

**Requirements:**
- `GITHUB_TOKEN` env var set (for API access)
- Target Pages repo exists with GitHub Pages enabled (source: main branch, /docs folder)

## 2. One Repo, One Signature Artifact

Run the full ritual on a single repo: decide what to build, generate the blueprint, build it, then verify.

```bash
# Step 1: Generate a decision packet
artifact drive /path/to/repo --curator-speak --explain

# Step 2: Generate the blueprint pack
artifact blueprint /path/to/repo

# Step 3: Get a builder prompt for your LLM
artifact buildpack /path/to/repo

# Step 4: Build the artifact using the buildpack prompt in your chat LLM

# Step 5: Verify the artifact against the blueprint
artifact verify /path/to/repo --artifact path/to/artifact.md --record

# Or run steps 1-3 in one command
artifact ritual /path/to/repo
```

**Shortcut:** `artifact ritual` runs drive + blueprint + review + catalog in sequence.

## 3. Seasonal Curation

Apply a themed season to shape what kinds of artifacts get generated, then crawl with those rules active.

```bash
# Pick a season
artifact season list
artifact season set proof

# Crawl, skipping repos that already have a decision
artifact crawl --org my-org --skip-curated --format html --publish --pages-repo my-org/artifact-wall

# Check org health
artifact org status
artifact org bans

# End the season when done
artifact season end
```

**Available seasons:**

| Season | Theme | Bias |
|--------|-------|------|
| `proof` | Integrity + verification | Dev, Exec tiers |
| `field_manuals` | Pocket docs + checklists | Dev tier |
| `play` | Games + puzzles | Fun, Creator tiers |
| `launch` | Promotion + demos | Promotion tier |
| `museums` | Placards + exhibits | Fun, Creator tiers |

**Recommended sequence:** `proof` (establish rigor) → `field_manuals` (ship docs) → `play` (build engagement) → `launch` (promote) → `museums` (archive).

---

## Templates

### Repo List File (for `--from`)

Create a text file with one `owner/repo` per line:

```
# repos.txt — curate these repos
my-org/api-server
my-org/cli-tool
my-org/shared-lib
# comment lines and blank lines are ignored
```

```bash
artifact crawl --from repos.txt --format html
```

### Pages Repo Setup

1. Create a new repo (e.g., `my-org/artifact-wall`)
2. Go to Settings → Pages
3. Set source to **Deploy from a branch**
4. Set branch to `main`, folder to `/docs`
5. Save

```bash
# Publish your catalog
artifact publish --pages-repo my-org/artifact-wall

# Your wall is live at:
# https://my-org.github.io/artifact-wall/
```

### Remote Repo Analysis

Analyze any public GitHub repo without cloning it:

```bash
artifact drive --remote owner/repo --curator-speak
artifact blueprint --remote owner/repo
artifact review --remote owner/repo
```

Remote results are cached at `~/.artifact/repos/owner/repo/`. Use `--remote-refresh` to bypass the cache.
