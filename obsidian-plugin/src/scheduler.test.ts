import {afterEach,expect,it,vi} from 'vitest'
import {SyncScheduler} from './scheduler'
afterEach(()=>vi.useRealTimers())
it('debounces file events and never runs two synchronizations concurrently',async()=>{
 vi.useFakeTimers();let runs=0,release:()=>void=()=>{};const scheduler=new SyncScheduler(async()=>{runs++;await new Promise<void>(r=>release=r)},2000)
 scheduler.changed();scheduler.changed();await vi.advanceTimersByTimeAsync(2000);expect(runs).toBe(1);scheduler.changed();await vi.advanceTimersByTimeAsync(2000);expect(runs).toBe(1);release();await Promise.resolve();scheduler.stop()
})
it('stops pending work on unload',async()=>{vi.useFakeTimers();let runs=0;const s=new SyncScheduler(async()=>{runs++},2000);s.changed();s.stop();await vi.advanceTimersByTimeAsync(5000);expect(runs).toBe(0)})
it('ignores events during its own file application',async()=>{vi.useFakeTimers();let runs=0;const s=new SyncScheduler(async()=>{runs++;s.changed()},2000);await s.now();await vi.advanceTimersByTimeAsync(5000);expect(runs).toBe(1);s.stop()})

it('runs conflict resolution exclusively after a running sync',async()=>{let release:()=>void=()=>{};const order:string[]=[];const s=new SyncScheduler(async()=>{order.push('sync');await new Promise<void>(r=>release=r)},2000);const running=s.now();await Promise.resolve();const choice=s.exclusive(async()=>{order.push('choice')});expect(order).toEqual(['sync']);release();await running;await choice;expect(order).toEqual(['sync','choice']);s.stop()})
