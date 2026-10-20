// ADR 详情单独拆包：只在加载 ADR 公司时引入；sofi 在 adr 之后合并，覆盖同名字段。
import { mergeDetails, parseDetails } from '../detailParser'
import { adrDetails } from './adr'
import { sofiDetails } from './sofi'

export const adrGroupDetails = mergeDetails(parseDetails(adrDetails), parseDetails(sofiDetails))
