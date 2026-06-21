import PageHeader from './PageHeader'

interface Props {
  title: string
  note?: string
}

/** Temporary section scaffold, replaced as each milestone lands. */
export default function Placeholder({ title, note }: Props): JSX.Element {
  return (
    <div className="h-full flex flex-col">
      <PageHeader title={title} />
      <div className="flex-1 grid place-items-center text-ink-faint text-sm">
        {note ?? 'Coming soon.'}
      </div>
    </div>
  )
}
