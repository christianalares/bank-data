import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { cn } from '#/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const triggerLabelFormatter = new Intl.DateTimeFormat('en-SE', {
  month: 'short',
  year: 'numeric',
})

type Props = {
  value: Date | null
  onChange: (month: Date | null) => void
  placeholder?: string
  className?: string
}

export function MonthPicker({ value, onChange, placeholder = 'All months', className }: Props) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (value ?? new Date()).getFullYear())

  function handleSelect(monthIndex: number) {
    onChange(new Date(viewYear, monthIndex, 1))
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setViewYear((value ?? new Date()).getFullYear())
        }
        setOpen(next)
      }}
    >
      <div className={cn('inline-flex items-center', className)}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn('justify-start font-normal', !value && 'text-muted-foreground')}
          >
            <CalendarIcon data-icon="inline-start" />
            {value ? triggerLabelFormatter.format(value) : placeholder}
          </Button>
        </PopoverTrigger>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear month filter"
            className="ml-0.5"
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      <PopoverContent className="w-64" align="start">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            onClick={() => setViewYear((year) => year - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="text-xs font-medium tabular-nums">{viewYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            onClick={() => setViewYear((year) => year + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {MONTHS.map((label, index) => {
            const isSelected =
              value !== null && value.getFullYear() === viewYear && value.getMonth() === index

            return (
              <Button
                key={label}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                className="w-full"
                onClick={() => handleSelect(index)}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
