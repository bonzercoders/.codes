import { type CSSProperties } from "react"

import { Slider } from "@/components/registry/slider"

interface ParameterSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  accent: string
}

function getStepDecimals(step: number): number {
  const stepText = String(step)
  const decimalPart = stepText.includes(".") ? stepText.split(".")[1] : ""
  return decimalPart.length
}

function formatValue(value: number, step: number): string {
  const decimals = getStepDecimals(step)

  if (decimals === 0) {
    return String(Math.round(value))
  }

  return value.toFixed(decimals)
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  accent,
}: ParameterSliderProps) {
  const style = {
    "--llm-slider-accent": accent,
  } as CSSProperties

  return (
    <div className="llm-parameter-slider" style={style}>
      <div className="llm-parameter-slider__head">
        <span className="llm-parameter-slider__label">{label}</span>
        <span className="llm-parameter-slider__value">{formatValue(value, step)}</span>
      </div>

      <Slider
        className="llm-parameter-slider__control"
        max={max}
        min={min}
        onValueChange={(nextValues) => {
          const next = nextValues[0]
          if (typeof next === "number") {
            onChange(next)
          }
        }}
        step={step}
        value={[value]}
      />
    </div>
  )
}
