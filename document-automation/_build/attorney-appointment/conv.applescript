-- osascript conv.applescript <in.doc> <out.docx>
-- Word itself converts the firm's .doc, so nothing is re-interpreted by a third-party converter.
-- Closes only the document it opened (matched by path), never the user's other windows.
on run argv
  set inPath to item 1 of argv
  set outPath to item 2 of argv
  tell application "Microsoft Word"
    open file name inPath
    set target to missing value
    repeat with x in (get documents)
      if (posix full name of x) is inPath then set target to x
    end repeat
    if target is missing value then error "not found: " & inPath
    save as target file name outPath file format format document
  end tell
  tell application "Microsoft Word"
    repeat with x in (get documents)
      if (posix full name of x) is outPath or (posix full name of x) is inPath then close x saving no
    end repeat
  end tell
end run
