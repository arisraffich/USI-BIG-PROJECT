import React from 'react'

/**
 * Highlights only the differences between original and edited text
 * Returns JSX elements with red highlighting on changed portions
 */
export function highlightTextDiff(original: string, edited: string): React.ReactNode {
  if (!original && !edited) return null
  if (!original) return <span className="text-red-600">{edited}</span>
  if (!edited) return original

  // If texts are identical, return original
  if (original === edited) return original

  // Simple word-by-word diff for highlighting
  const originalWords = original.split(/(\s+)/)
  const editedWords = edited.split(/(\s+)/)

  const result: React.ReactNode[] = []
  let origIdx = 0
  let editIdx = 0

  while (origIdx < originalWords.length || editIdx < editedWords.length) {
    const origWord = origIdx < originalWords.length ? originalWords[origIdx] : null
    const editWord = editIdx < editedWords.length ? editedWords[editIdx] : null

    // If words match, add normally
    if (origWord === editWord) {
      if (origWord) result.push(origWord)
      origIdx++
      editIdx++
    } else {
      // Find where they match again (lookahead)
      let matchFound = false
      let lookaheadOrig = origIdx
      let lookaheadEdit = editIdx

      // Try to find next matching point
      while (lookaheadOrig < originalWords.length && lookaheadEdit < editedWords.length) {
        if (originalWords[lookaheadOrig] === editedWords[lookaheadEdit]) {
          matchFound = true
          break
        }
        // Try advancing original
        if (lookaheadOrig + 1 < originalWords.length &&
          originalWords[lookaheadOrig + 1] === editedWords[lookaheadEdit]) {
          lookaheadOrig++
          matchFound = true
          break
        }
        // Try advancing edited
        if (lookaheadEdit + 1 < editedWords.length &&
          originalWords[lookaheadOrig] === editedWords[lookaheadEdit + 1]) {
          lookaheadEdit++
          matchFound = true
          break
        }
        lookaheadOrig++
        lookaheadEdit++
      }

      if (matchFound) {
        // Highlight the changed portion
        const changedOriginal = originalWords.slice(origIdx, lookaheadOrig).join('')
        const changedEdited = editedWords.slice(editIdx, lookaheadEdit).join('')

        if (changedOriginal || changedEdited) {
          result.push(
            <span key={`diff-${origIdx}`} className="text-red-600">
              {changedEdited || changedOriginal}
            </span>
          )
        }

        origIdx = lookaheadOrig
        editIdx = lookaheadEdit
      } else {
        // No match found, highlight everything remaining
        const remainingOriginal = originalWords.slice(origIdx).join('')
        const remainingEdited = editedWords.slice(editIdx).join('')

        if (remainingEdited) {
          result.push(
            <span key={`diff-end`} className="text-red-600">
              {remainingEdited}
            </span>
          )
        } else if (remainingOriginal) {
          result.push(remainingOriginal)
        }
        break
      }
    }
  }

  return <>{result}</>
}

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




