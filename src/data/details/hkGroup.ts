// 港股详情单独拆包：只在加载港股公司时引入。
import { parseDetails } from '../detailParser'
import { hkDetails } from './hk'

export const hkGroupDetails = parseDetails(hkDetails)
