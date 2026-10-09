import { Link } from 'react-router-dom'
import { researchForCompany, researchPath } from '../data/futureTrendsResearch'

export default function FutureCompanyLink({ name, code }: { name: string; code: string }): JSX.Element {
  const r = researchForCompany(name, code)
  return r ? <Link to={researchPath(r.key)}>{name}</Link> : <span>{name}（主体待核）</span>
}
