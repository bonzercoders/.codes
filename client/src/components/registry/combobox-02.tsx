"use client"

import { Fragment, useId, useMemo, useState } from "react"

import { ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/registry/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/registry/popover"
import { formatModelLabelFromId, type ModelGroup } from "@/lib/openrouter-models"

interface ModelComboboxProps {
  groups: ModelGroup[]
  value: string
  onValueChange: (value: string) => void
  loading?: boolean
  error?: string | null
  placeholder?: string
}

function findOptionLabel(groups: ModelGroup[], value: string): string | null {
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value)
    if (match) {
      return match.label
    }
  }

  return null
}

export function ModelCombobox({
  groups,
  value,
  onValueChange,
  loading = false,
  error = null,
  placeholder = "Select model",
}: ModelComboboxProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const selectedLabel = useMemo(() => {
    if (!value) {
      return ""
    }

    return findOptionLabel(groups, value) ?? formatModelLabelFromId(value)
  }, [groups, value])

  return (
    <div className="llm-model-combobox">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="llm-model-combobox__trigger"
            id={id}
            role="combobox"
            type="button"
            variant="secondary"
          >
            {selectedLabel ? (
              <span className="llm-model-combobox__value" title={value}>
                {selectedLabel}
              </span>
            ) : (
              <span className="llm-model-combobox__placeholder">
                {loading ? "Loading models..." : placeholder}
              </span>
            )}
            <ChevronsUpDownIcon aria-hidden="true" className="llm-model-combobox__chevron" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="llm-model-combobox__content">
          <Command>
            <CommandInput placeholder="Search model..." />
            <CommandList>
              {!loading && !error ? <CommandEmpty>No matching model.</CommandEmpty> : null}

              {loading ? <div className="llm-model-combobox__state">Loading models...</div> : null}

              {!loading && error ? <div className="llm-model-combobox__state">{error}</div> : null}

              {!loading && !error
                ? groups.map((group) => (
                    <Fragment key={group.provider}>
                      <CommandGroup heading={group.provider}>
                        {group.options.map((item) => (
                          <CommandItem
                            data-checked={value === item.value}
                            key={item.value}
                            onSelect={() => {
                              onValueChange(item.value)
                              setOpen(false)
                            }}
                            value={item.value}
                          >
                            <span className="llm-model-combobox__item-label">{item.label}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Fragment>
                  ))
                : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
