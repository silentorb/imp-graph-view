import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

export type SearchActivateOptions = {
  /** Ctrl/Cmd was held (e.g. open in a new tab instead of in place). */
  modifier: boolean
}

export type SearchModalProps<T> = {
  open: boolean
  onClose: () => void
  /**
   * Results for a query. Sync results show immediately; async results are debounced
   * (`debounceMs`) and stale responses are dropped.
   */
  search: (query: string) => readonly T[] | Promise<readonly T[]>
  getKey: (item: T) => string
  renderItem: (item: T, state: { active: boolean }) => ReactNode
  /** Chosen with Enter or a click. The modal closes first unless `closeOnActivate` is false. */
  onActivate: (item: T, options: SearchActivateOptions) => void
  ariaLabel: string
  placeholder?: string
  /** Shown when there are no results (default "No matches"). */
  emptyText?: (query: string) => ReactNode
  /** Footer hint (default lists the keys). Pass `null` to hide. */
  footer?: ReactNode
  debounceMs?: number
  closeOnActivate?: boolean
  className?: string
}

const DEFAULT_FOOTER = "↑↓ navigate · Enter choose · Esc close"

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function"
}

/**
 * Centered quick-pick: a search field over a keyboard-navigable result list. Unstyled apart
 * from `imp-gv-search-*` classes (`imp-graph-view/styles.css`), themed by `--imp-gv-search-*`
 * custom properties. Rendered into `document.body`.
 */
export function SearchModal<T>(props: SearchModalProps<T>) {
  if (!props.open || typeof document === "undefined") return null
  return createPortal(<SearchModalBody {...props} />, document.body)
}

function SearchModalBody<T>({
  onClose,
  search,
  getKey,
  renderItem,
  onActivate,
  ariaLabel,
  placeholder = "Search…",
  emptyText,
  footer = DEFAULT_FOOTER,
  debounceMs = 120,
  closeOnActivate = true,
  className,
}: SearchModalProps<T>) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<readonly T[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef(search)
  searchRef.current = search
  const requestRef = useRef(0)
  const asyncRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const request = ++requestRef.current
    const apply = (items: readonly T[]) => {
      if (request !== requestRef.current) return
      setResults(items)
      setActiveIndex(0)
      setLoading(false)
      setError(null)
    }
    const fail = (err: unknown) => {
      if (request !== requestRef.current) return
      setResults([])
      setLoading(false)
      setError(err instanceof Error ? err.message : String(err))
    }
    const run = () => {
      let out: readonly T[] | Promise<readonly T[]>
      try {
        out = searchRef.current(query)
      } catch (err) {
        fail(err)
        return
      }
      if (isPromise(out)) {
        asyncRef.current = true
        setLoading(true)
        out.then(apply, fail)
      } else {
        apply(out)
      }
    }
    // The first query runs at once; once the source has proved async, later queries wait
    // for typing to pause so each key does not fire a request.
    if (!asyncRef.current) {
      run()
      return
    }
    setLoading(true)
    const handle = window.setTimeout(run, debounceMs)
    return () => window.clearTimeout(handle)
  }, [debounceMs, query])

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    active?.scrollIntoView?.({ block: "nearest" })
  }, [activeIndex, results])

  const activate = useCallback(
    (item: T, modifier: boolean) => {
      if (closeOnActivate) onClose()
      onActivate(item, { modifier })
    },
    [closeOnActivate, onActivate, onClose],
  )

  const onKeyDown = (event: ReactKeyboardEvent) => {
    // Keep host shortcuts (graph canvas, app keymap) from seeing keys typed here.
    event.stopPropagation()
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === "Enter") {
      const item = results[activeIndex]
      if (item !== undefined) {
        event.preventDefault()
        activate(item, event.metaKey || event.ctrlKey)
      }
    }
  }

  const activeKey = results[activeIndex] !== undefined ? getKey(results[activeIndex]!) : undefined

  return (
    <div
      className="imp-gv-search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={className ? `imp-gv-search ${className}` : "imp-gv-search"}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          className="imp-gv-search-input"
          placeholder={placeholder}
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeKey ? `${listId}-${activeKey}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div ref={listRef} id={listId} className="imp-gv-search-list" role="listbox">
          {error ? <div className="imp-gv-search-error">{error}</div> : null}
          {results.length === 0 && !error ? (
            <div className="imp-gv-search-empty">
              {loading ? "Searching…" : (emptyText?.(query) ?? "No matches")}
            </div>
          ) : null}
          {results.map((item, index) => {
            const key = getKey(item)
            const active = index === activeIndex
            return (
              <div
                key={key}
                id={`${listId}-${key}`}
                role="option"
                aria-selected={active}
                className={active ? "imp-gv-search-item is-active" : "imp-gv-search-item"}
                onMouseMove={() => {
                  if (!active) setActiveIndex(index)
                }}
                // Keep focus in the input so the keyboard keeps working after a hover.
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => activate(item, event.metaKey || event.ctrlKey)}
              >
                {renderItem(item, { active })}
              </div>
            )
          })}
        </div>
        {footer !== null ? <div className="imp-gv-search-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
