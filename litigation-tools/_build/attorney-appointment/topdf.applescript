-- osascript topdf.applescript <in.docx> <out.pdf>   (renders with Word; closes only that document)
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
    save as target file name outPath file format format PDF
    close target saving no
  end tell
end run
