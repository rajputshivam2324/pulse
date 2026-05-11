'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

export function FormattedMessage({ content }: { content: string }) {
  return (
    <div className="chat-markdown min-w-0 max-w-full overflow-x-auto text-sm f1-m leading-relaxed [&_*]:max-w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
