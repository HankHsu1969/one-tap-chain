"""把遊戲用的三套字型裁成只含遊戲裡出現過的字，給 iOS App 離線用（網頁版照樣從 Google Fonts 載入）。

用法：python tools/subset-fonts.py <Bungee-Regular.ttf> <MPLUSRounded1c-Black.ttf> <NotoSansTC[wght].ttf>
原始字型從 https://github.com/google/fonts 的 ofl/bungee、ofl/mplusrounded1c、ofl/notosanstc 下載。
輸出到 app/fonts/。改了畫面上的中文字之後要重跑一次，不然新字會用系統字型（蘋方）代替。
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'app' / 'fonts'


def used_chars():
    text = ''.join((ROOT / 'src' / f).read_text(encoding='utf-8') for f in ('ui.js', 'page.html', 'core.js'))
    chars = {c for c in text if ord(c) > 127} | {chr(i) for i in range(32, 127)}
    chars |= set('０１２３４５６７８９：；，。！？、（）「」『』…—～×')
    return sorted(ord(c) for c in chars)


def save(font, unicodes, name, wght=None):
    opts = subset.Options()
    opts.layout_features = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    if wght:  # 先裁字再縮粗細範圍；反過來做 fontTools 會出錯
        font = instancer.instantiateVariableFont(font, {'wght': wght})
    font.flavor = 'woff2'
    out = OUT / name
    font.save(out)
    print(f'{name}: {out.stat().st_size // 1024} KB')


def main():
    bungee, mplus, noto = sys.argv[1:4]
    OUT.mkdir(parents=True, exist_ok=True)
    u = used_chars()
    print(f'{len(u)} 個字元')
    save(TTFont(bungee), u, 'Bungee-Regular.woff2')
    save(TTFont(mplus), u, 'MPLUSRounded1c-Black.woff2')
    # 遊戲只用到 500、700、900 三種粗細，可變字型只留這一段
    save(TTFont(noto), u, 'NotoSansTC-500-900.woff2', wght=(500, 900))


if __name__ == '__main__':
    main()
