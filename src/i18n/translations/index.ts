import type { TranslationMap } from './types'
import { en, uz } from './base'
import { esEs } from './west'
import { frFr } from './west'
import { deDe } from './west'
import { itIt } from './west'
import { ptPt, ptBR } from './west'
import { nlNl } from './west'
import { svSe } from './north'
import { noNb } from './north'
import { daDk } from './north'
import { fiFi } from './north'
import { ruRu } from './slavic'
import { ukUa } from './slavic'
import { beBy } from './slavic'
import { bgBg } from './slavic'
import { srSr } from './slavic'
import { hrHr } from './slavic'
import { slSi } from './slavic'
import { plPl } from './slavic'
import { csCz } from './slavic'
import { skSk } from './slavic'
import { trTr } from './turkic'
import { azAz } from './turkic'
import { kkKk } from './turkic'
import { kyKy } from './turkic'
import { tkTk } from './turkic'
import { tgTj } from './turkic'
import { mnMn } from './turkic'
import { arAr } from './middleeast'
import { faFa } from './middleeast'
import { heHe } from './middleeast'
import { urUr } from './middleeast'
import { hiIn } from './indian'
import { bnBd } from './indian'
import { paIn } from './indian'
import { mrIn } from './indian'
import { teIn } from './indian'
import { taIn } from './indian'
import { mlIn } from './indian'
import { knIn } from './indian'
import { guIn } from './indian'
import { siLk } from './indian'
import { neNp } from './indian'
import { thTh } from './southeast'
import { viVn } from './southeast'
import { idId } from './southeast'
import { msMy } from './southeast'
import { filPh } from './southeast'
import { kmKh } from './southeast'
import { loLa } from './southeast'
import { myMm } from './southeast'
import { zhCN } from './east'
import { zhTW } from './east'
import { jaJp } from './east'
import { koKr } from './east'
import { huHu } from './central'
import { elGr } from './central'
import { roRo } from './central'
import { kaGe } from './central'
import { hyAm } from './central'
import { swKe } from './africa'
import { amEt } from './africa'
import { haNe } from './africa'
import { yoNg } from './africa'
import { zuZa } from './africa'
import { afZa } from './africa'
import { eoXx } from './africa'

export const translations: TranslationMap = {
  uz,
  en,
  es: esEs,
  fr: frFr,
  de: deDe,
  it: itIt,
  pt: ptPt,
  'pt-BR': ptBR,
  nl: nlNl,
  sv: svSe,
  no: noNb,
  da: daDk,
  fi: fiFi,
  ru: ruRu,
  uk: ukUa,
  be: beBy,
  bg: bgBg,
  sr: srSr,
  hr: hrHr,
  sl: slSi,
  pl: plPl,
  cs: csCz,
  sk: skSk,
  tr: trTr,
  az: azAz,
  kk: kkKk,
  ky: kyKy,
  tk: tkTk,
  tg: tgTj,
  mn: mnMn,
  ar: arAr,
  fa: faFa,
  he: heHe,
  ur: urUr,
  hi: hiIn,
  bn: bnBd,
  pa: paIn,
  mr: mrIn,
  te: teIn,
  ta: taIn,
  ml: mlIn,
  kn: knIn,
  gu: guIn,
  si: siLk,
  ne: neNp,
  th: thTh,
  vi: viVn,
  id: idId,
  ms: msMy,
  fil: filPh,
  km: kmKh,
  lo: loLa,
  my: myMm,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja: jaJp,
  ko: koKr,
  hu: huHu,
  el: elGr,
  ro: roRo,
  ka: kaGe,
  hy: hyAm,
  sw: swKe,
  am: amEt,
  ha: haNe,
  yo: yoNg,
  zu: zuZa,
  af: afZa,
  eo: eoXx,
}

// Region/dialect codes that should inherit from a parent dictionary.
export const inheritMap: Record<string, string> = {
  'en-GB': 'en',
  'es-419': 'es',
}