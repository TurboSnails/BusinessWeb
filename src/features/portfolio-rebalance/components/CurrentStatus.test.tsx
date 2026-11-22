import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CurrentStatus } from './CurrentStatus'
import { createRunResultFixture } from '../fixtures'
import type { RunInput, SignalState } from '../types'
import { createDefaultInput } from '../urlState'

afterEach(() => cleanup())

const names = { AVGO: '博通', META: 'Meta', CB: '安达保险' }

function signalState(partial: Partial<SignalState> = {}): SignalState {
  return {
    symbol: 'SPY',
    asOf: '2026-11-20',
    close: 88,
    peak: 100,
    peakDate: '2021-12-01',
    drawdown: -0.12,
    inStress: false,
    steps: 0,
    soldFraction: 0,
    nextStepDrawdown: -0.15,
    recoverDrawdown: -0.05,
    pendingAction: null,
    ...partial,
  }
}

function inputWithSwitch(extra: Partial<RunInput> = {}): RunInput {
  return {
    ...createDefaultInput(),
    switch: { stable: 'CB', entry: 0.15, gap: 0.05, step: 0.25, recover: 0.05 },
    signal: 'SPY',
    ...extra,
  }
}

describe('CurrentStatus 信号位置', () => {
  it('未触发时显示回撤与下一步触发位', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState(),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText('信号指数当前位置')).toBeTruthy()
    expect(screen.getByText(/标普 500（SPY）/)).toBeTruthy()
    expect(screen.getByText(/未触发/)).toBeTruthy()
    expect(screen.getByText(/回撤到/)).toBeTruthy()
    expect(screen.queryByText('当前离线距离')).toBeNull()
  })

  it('大跌状态中显示步数与累计卖出', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 2,
        soldFraction: 0.5,
        drawdown: -0.22,
        nextStepDrawdown: -0.25,
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/大跌状态中，已成交 2 步/)).toBeTruthy()
    expect(screen.getByText(/累计卖出稳定资产的 50\.0%/)).toBeTruthy()
    expect(screen.getByText(/恢复位/)).toBeTruthy()
  })

  it('到上限时写明已到累计卖出上限', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 2,
        soldFraction: 0.5,
        nextStepDrawdown: null,
      }),
    })
    render(
      <CurrentStatus
        result={result}
        names={names}
        input={inputWithSwitch({
          switch: { stable: 'CB', entry: 0.15, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5 },
        })}
      />,
    )
    expect(screen.getByText('已到累计卖出上限')).toBeTruthy()
  })

  it('买入持有规则下 distance 为空仍显示信号位置', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({ symbol: 'QQQ', drawdown: -0.2 }),
    })
    render(
      <CurrentStatus
        result={result}
        names={names}
        input={{ ...inputWithSwitch(), rule: { kind: 'buyHold' }, signal: undefined }}
      />,
    )
    expect(screen.getByText('信号指数当前位置')).toBeTruthy()
    expect(screen.getByText(/纳指 100（QQQ）/)).toBeTruthy()
    expect(screen.queryByText('当前离线距离')).toBeNull()
  })

  it('pendingAction=step 且 steps=0：刚进入文案', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 0,
        pendingAction: 'step',
        drawdown: -0.15,
        nextStepDrawdown: -0.2,
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/最后一个交易日收盘刚进入大跌状态，第一步按规则在下一交易日成交/)).toBeTruthy()
    expect(screen.getByText(/下一步触发位/)).toBeTruthy()
  })

  it('pendingAction=step 且已成交：又触发一步文案', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 1,
        soldFraction: 0.25,
        pendingAction: 'step',
        drawdown: -0.26,
        nextStepDrawdown: -0.3,
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/已成交 1 步；最后一个交易日收盘又触发一步/)).toBeTruthy()
  })

  it('pendingAction=recover：隐藏下一步与恢复位', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 1,
        soldFraction: 0.25,
        drawdown: -0.04,
        pendingAction: 'recover',
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/已满足恢复条件，按规则在下一交易日调回目标权重/)).toBeTruthy()
    expect(screen.queryByText('下一步触发位')).toBeNull()
    expect(screen.queryByText('恢复位')).toBeNull()
  })

  it('pendingAction=timeout：隐藏下一步与恢复位', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 2,
        pendingAction: 'timeout',
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/已到超时期限，按规则在下一交易日调回目标权重/)).toBeTruthy()
    expect(screen.queryByText('下一步触发位')).toBeNull()
    expect(screen.queryByText('恢复位')).toBeNull()
  })

  it('当前回撤已低于下一档时的文案', () => {
    const result = createRunResultFixture({
      distance: [],
      signalState: signalState({
        inStress: true,
        steps: 1,
        soldFraction: 0.25,
        drawdown: -0.3,
        nextStepDrawdown: -0.25,
      }),
    })
    render(<CurrentStatus result={result} names={names} input={inputWithSwitch()} />)
    expect(screen.getByText(/当前回撤已低于该档，下一交易日收盘仍低于该档时触发/)).toBeTruthy()
  })
})
