# Monkey Moonshine — custom sounds

Every sound is synthesized in-game by default (no files needed). To replace any
sound with your own recording, drop the file in this folder and add its name to
the `SND_FILES` map near the top of the sound block in
`games/monkey-moonshine.html`.

Supported: `.mp3`, `.ogg`, `.wav`.

| key          | plays when…                          | loops? |
|--------------|--------------------------------------|--------|
| `shake`      | tree shake / change tree             | no     |
| `rowClunk`   | a row settles into the dirt          | no     |
| `lineMatch`  | a winning payline is drawn           | no     |
| `wildLand`   | a wild fruit lands                   | no     |
| `monkeyWild` | a monkey wild appears                | no     |
| `extraShake` | an extra shake is earned             | no     |
| `whoosh`     | the monkey-dot fill animation        | no     |
| `coconutRow` | a row of coconuts lands              | no     |
| `moonshine`  | the MONKEY MOONSHINE banner triggers | no     |
| `uiClick`    | opening the WILD FRUIT menu          | no     |
| `coin`       | the bet + / − increment              | no     |
| `ambient`    | background bed, from first tap       | yes    |
| `music`      | MONKEY MOONSHINE music               | yes    |

Example (in `games/monkey-moonshine.html`):

```js
const SND_FILES = {
  moonshine: 'assets/mm/sounds/moonshine.mp3',
  ambient:   'assets/mm/sounds/ambient.mp3',
  music:     'assets/mm/sounds/moonshine-music.mp3',
};
```
