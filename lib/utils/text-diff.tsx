import React from 'react'

/**
 * Simpler approach: Find the longest common prefix and suffix,
 * highlight everything in between
 * This highlights only the changed/added portion in red
 */
export function highlightTextDiffSimple(
  original: string,
  edited: string,
  color: 'red' | 'blue' = 'red'
): React.ReactNode {
  // Handle edge cases
  if (!original && !edited) return null
  const textColorClass = color === 'red' ? 'text-red-600' : 'text-blue-600'

  if (!original && edited) return <span className={textColorClass}>{edited}</span>
  if (original && !edited) return original

  // Normalize strings
  const orig = original.trim()
  const edit = edited.trim()

  // If texts are identical, return original (no highlighting needed)
  if (orig === edit) return edited

  // Character-by-character comparison for more accurate diff
  // Find common prefix
  let prefixEnd = 0
  const minLength = Math.min(orig.length, edit.length)
  while (prefixEnd < minLength && orig[prefixEnd] === edit[prefixEnd]) {
    prefixEnd++
  }

  // Find common suffix (working backwards from the end)
  let suffixStart = 0
  const remainingLength = Math.min(
    orig.length - prefixEnd,
    edit.length - prefixEnd
  )

  while (
    suffixStart < remainingLength &&
    orig[orig.length - 1 - suffixStart] === edit[edit.length - 1 - suffixStart]
  ) {
    suffixStart++
  }

  const prefix = orig.substring(0, prefixEnd)
  const suffix = orig.substring(orig.length - suffixStart)
  const editedMiddle = edit.substring(prefixEnd, edit.length - suffixStart)

  // Only highlight the difference if there is a clear difference
  if (editedMiddle && editedMiddle.trim()) {
    return (
      <>
        {prefix}
        <span className={textColorClass}>{editedMiddle}</span>
        {suffix}
      </>
    )
  }

  // If no clear diff found, return edited text without highlighting
  // This prevents highlighting entire text when diff algorithm can't find differences
  return edited
}




