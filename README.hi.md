<p align="center">
  <a href="README.hi.md">हिन्दी</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.ja.md">日本語</a> | <a href="README.pt-BR.md">Português (BR)</a> | <a href="README.zh.md">中文</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/artifact/readme.png" width="400" alt="Artifact">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/artifact/actions"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/artifact/ci.yml?label=CI" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/artifact"><img src="https://img.shields.io/npm/v/@mcptoolshop/artifact" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/artifact/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/artifact/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

रिपो सिग्नेचर आर्टिफैक्ट निर्णय प्रणाली। यह किसी भी रिपो के लिए एक "ताजगी" जांच चलाती है और एक संरचित निर्णय पैकेज उत्पन्न करती है, जिसमें स्तर, प्रारूप, प्रतिबंध, हुक और "सत्य" तत्वों के साथ `फ़ाइल:लाइन` संदर्भ शामिल होते हैं।

"क्यूरेटर" (स्थानीय ओलामा) निर्णय लेने में महत्वपूर्ण भूमिका निभाता है। यदि ओलामा उपलब्ध नहीं है, तो एक पूर्वनिर्धारित प्रक्रिया का उपयोग करके मान्य परिणाम उत्पन्न किए जाते हैं, जिसमें अनुमानित प्रोफाइल और "सीडेड रोटेशन" शामिल हैं।

## स्थापित करें।

```bash
npm install -g @mcptoolshop/artifact
```

या फिर सीधे चलाएं:

```bash
npx @mcptoolshop/artifact doctor
```

## शुरुआत कैसे करें।

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## आदेश।

### मुख्य भाग।

| आदेश। | यह क्या करता है। |
|---------|-------------|
| `drive [repo-path]` | "क्यूरेटर" फ़्रेशनेस ड्राइवर को चलाएं। |
| `infer [repo-path]` | गणना प्रक्रिया का विवरण तैयार करें (ओलामा की आवश्यकता नहीं है)। |
| `ritual [repo-path]` | पूर्ण प्रक्रिया: योजना बनाना + डिज़ाइन तैयार करना + समीक्षा करना + सूची बनाना। |
| `blueprint [repo-path]` | नवीनतम निर्णय के आधार पर ब्लूप्रिंट पैकेज तैयार करें। |
| `buildpack [repo-path]` | चैट एलएलएम (LLM) के लिए बिल्डर प्रॉम्प्ट पैकेट जारी करें। |
| `verify [repo-path] --artifact <path>` | "ब्लूप्रिंट के साथ लिंट त्रुटि + सत्यता पैकेज।" |
| `review [repo-path]` | एक चार-खंड वाला संपादकीय समीक्षा कार्ड प्रिंट करें। |
| `catalog` | मौसम के अनुसार कैटलॉग तैयार करें। |

### स्थापना और निदान।

| आदेश। | यह क्या करता है। |
|---------|-------------|
| `doctor` | पर्यावरण की स्वास्थ्य जांच (नोड, ओलामा, गिट, कॉन्फ़िगरेशन)। |
| `init` | पहली बार उपयोग करते समय, यह कॉन्फ़िगरेशन बनाता है। |
| `about` | संस्करण, सक्रिय व्यक्तित्व, और बुनियादी नियम। |
| `whoami` | "सक्रिय उपयोगकर्ता का नाम और नारा प्रिंट करें।" |
| `--version` | प्रिंट संस्करण और बाहर निकलें। |

### स्मृति और इतिहास।

| आदेश। | यह क्या करता है। |
|---------|-------------|
| `memory show [--org]` | रिपॉजिटरी या संगठन स्तर पर मेमोरी का प्रदर्शन दिखाएं। |
| `memory forget <name>` | किसी रिपॉजिटरी (रेपो) की मेमोरी को भूल जाइए। |
| `memory prune <days>` | उन प्रविष्टियों को हटा दें जो N दिनों से पुरानी हैं। |
| `memory stats` | मेमोरी से संबंधित आंकड़े। |

### संगठन-व्यापी क्यूरेशन।

| आदेश। | यह क्या करता है। |
|---------|-------------|
| "मौसमों की सूची" या "मौसमों की जानकारी" | सेट। | स्थिति। | अंत। | संग्रहण सत्रों का प्रबंधन करें। |
| `org status` | कवरेज, विविधता स्कोर, कमियां। |
| `org ledger [n]` | अंतिम एन निर्णय। |
| `org bans` | वर्तमान में लागू किए गए ऑटो-बैन और उनके कारण। |
| `config get [key]` | कॉन्फ़िगरेशन मानों को पढ़ें। |
| `config set <key> <value>` | कॉन्फ़िगरेशन सेट करें (उदाहरण के लिए, `agent_name`)। |

## ड्राइविंग विकल्प।

```
--no-curator         Skip Ollama, use deterministic fallback
--curator-speak      Print Curator callouts (veto/twist/pick/risk)
--explain            Print inference profile (why this tier)
--blueprint          Also generate Blueprint Pack
--review             Also print review card
--type <type>        Repo type (R1_tooling_cli, etc.)
--web                Enable web recommendations
--curate-org         Enable org-wide curation (season + bans + gaps)
```

## आउटपुट।

यह `.artifact/decision_packet.json` फ़ाइल को लक्षित रिपॉजिटरी में लिखता है:

```json
{
  "repo_name": "my-tool",
  "tier": "Fun",
  "format_candidates": ["F2_card_deck", "F9_museum_placard"],
  "constraints": ["monospace-only", "uses-failure-mode"],
  "must_include": ["one real invariant", "one failure mode", "one CLI flag"],
  "freshness_payload": {
    "weird_detail": "uses \\\\?\\ prefix to bypass Win32 parsing",
    "recent_change": "v1.0.3 added TOCTOU identity checks",
    "sharp_edge": "HMAC dot-separator must be in outer base64 layer"
  }
}
```

## व्यक्तित्व।

तीन अंतर्निहित क्यूरेटर प्रोफाइल उपलब्ध हैं। डिफ़ॉल्ट: **ग्लिफ़**.

| व्यक्तित्व। | भूमिका। | नारा/ध्येय वाक्य। |
|---------|------|-------|
| ग्लिफ़ (एक प्रकार का चिह्न या प्रतीक) | डिज़ाइन संबंधी समस्याएँ/मुश्किलें। | बिना रसीद के कोई भी लेनदेन मान्य नहीं होगा। |
| मीना। | संग्रहालय के क्यूरेटर। | इसे विशिष्ट बनाएं। इसे संग्रहणीय बनाएं। |
| वेरा। | सत्यापन यंत्र/उपकरण। | सच्चाई, लेकिन उसे आकर्षक तरीके से प्रस्तुत करें। |

```bash
artifact whoami
artifact config set agent_name vera
```

## खतरे का मॉडल।

- **ओलामा केवल स्थानीय रूप से काम करता है।** कोई भी डेटा आपके मशीन से बाहर नहीं जाता। यह केवल `localhost` से जुड़ता है।
- **कोई भी डेटा संग्रह नहीं।** स्थानीय ओलामा को छोड़कर, कोई भी नेटवर्क कनेक्शन नहीं होता।
- **कोई भी गोपनीय जानकारी नहीं।** यह किसी भी प्रकार की जानकारी को नहीं पढ़ता, संग्रहीत नहीं करता, और न ही प्रसारित करता।
- **इतिहास स्थानीय रूप से संग्रहीत होता है।** `.artifact/` फ़ोल्डर रिपॉजिटरी में मौजूद होता है और डिफ़ॉल्ट रूप से इसे गिट द्वारा अनदेखा किया जाता है।
- **बैकअप प्रक्रिया निश्चित होती है।** यदि ओलामा काम नहीं कर रहा है, तो आउटपुट रिपॉजिटरी से प्राप्त जानकारी के आधार पर तैयार किया जाता है - यह यादृच्छिक नहीं, बल्कि पूर्वानुमानित होता है।
- **फ़ाइल दायरा: यह रिपॉजिटरी की स्रोत फ़ाइलों को पढ़ता है, और केवल `.artifact/` और `~/.artifact/` फ़ोल्डरों में लिखता है।**

## पर्यावरण चर (या पर्यावरण संबंधी चर)

| चर। | उद्देश्य। |
|----------|---------|
| `OLLAMA_HOST` | ओलामा एंडपॉइंट को ओवरराइड करें (डिफ़ॉल्ट: स्वचालित रूप से पता लगाना)। |
| `ARTIFACT_OLLAMA_MODEL` | एक विशिष्ट ओलामा मॉडल को लागू करें। |

## लाइसेंस।

एमआईटी।

---

यह उपकरण <a href="https://mcp-tool-shop.github.io/">MCP टूल शॉप</a> द्वारा बनाया गया है।
