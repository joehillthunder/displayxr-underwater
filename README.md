# Underwater Worlds 3D

Swim through ten underwater environments in glasses-free 3D. Photograph the creatures and landmarks
to fill your field guide, read real facts about each, and pass a quiz at every site to earn a
passport stamp. Built for [DisplayXR](https://joehillthunder.github.io/) (woven 3D on Leia
displays) and works as ordinary 2D in any modern browser.

**Play:** https://joehillthunder.github.io/displayxr-underwater/

| # | Site | Where | What you'll meet |
|---|---|---|---|
| 1 | Coral Reef | Great Barrier Reef | clownfish & anemone, green turtle, manta, blacktip sharks, parrotfish, blue tangs, giant clams, Endeavour's cannon |
| 2 | Kelp Forest | Monterey Bay | giant kelp, sea otters, harbor seals, garibaldi, leopard sharks, urchins, sunflower sea stars |
| 3 | Under the Arctic Ice | Lancaster Sound | narwhals, belugas, ringed seals, a polar bear, Arctic cod, Greenland shark, sea angels |
| 4 | Lake Baikal | Siberia | nerpa seals, golomyanka, Baikal sponges, omul, sculpins, amphipods, copepods |
| 5 | Amazon River | flooded forest near Manaus | pink river dolphins, piranhas, arapaima, electric eel, manatee, river stingray, giant water lilies |
| 6 | Open Ocean | near Tonga | humpback mother & calf, whale shark, sailfish & bait ball, sunfish, man o' war, spinner dolphins |
| 7 | Cenote Cave | Yucatán | stalactites, the halocline, blind cave fish, cave shrimp, Maya offerings, Ice-Age bones |
| 8 | Deep Sea & Vents | East Pacific Rise | lanternfish, vampire squid, giant squid, gulper eel, anglerfish, dumbo octopus, black smokers, tube worms |
| 9 | Mariana Trench | Challenger Deep | snailfish, hadal amphipods, xenophyophores, sea cucumbers, a science lander |
| 10 | Atlantis | Plato's legend | the ring city, Temple of Poseidon, orichalcum, octopus, moray, dolphins, a real sunken-city colossus |

## Controls

`W A S D` swim · drag or arrow keys to look · `Space` / `C` rise / sink · `Shift` faster ·
click or `E` to photograph · `G` field guide · `T` auto-tour · `L` name labels · `M` site map.
Touch: joystick bottom-left, up/down buttons bottom-right, drag to look, tap to photograph.

URL options: `?site=<id>`, `?tour`, `?mono` (force 2D), `?depth=0-2`, `?selftest`, `?reset`.

## How it's built

Plain ES modules with no build step: three.js 0.161 and the DisplayXR inline-3D SDK 1.45.1, both
loaded from jsDelivr. Every creature is procedural (no model files) and animated on the GPU. See
`CLAUDE.md` for the architecture.

Facts are written for curious kids and checked against published sources; legends are labelled as
legends. Spotted a mistake? Please open an issue.
