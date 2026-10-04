import test from 'node:test'
import assert from 'node:assert/strict'
import {validateAssumptions} from './analysis/validate.mjs'
test('rejects wrong security and invented evidence references',()=>{
 const snapshot={security:{market:'us',code:'AAPL',quoteCurrency:'USD'},asOf:'2026-10-04',sources:[{id:'sec'}]}
 assert.throws(()=>validateAssumptions({schemaVersion:1,security:{market:'us',code:'MSFT'},scenarios:{}},snapshot),/证券/)
 assert.throws(()=>validateAssumptions({schemaVersion:1,security:snapshot.security,valuationDate:snapshot.asOf,scenarios:{bear:{sourceIds:['invented']},base:{},bull:{}},analysis:[]},snapshot),/来源|结构/)
})
