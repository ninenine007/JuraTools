-- osascript topdf.applescript <in.docx> <out.pdf>
-- Word renders the document to PDF; only the document this script opened is closed.
on run argv
  set inPath to item 1 of argv
  set outPath to item 2 of argv
  tell application "Microsoft Word"
    with timeout of 300 seconds
      open file name inPath
      set target to missing value
      set n to count of documents
      repeat with i from 1 to n
        if (posix full name of document i) is inPath then set target to document i
      end repeat
      if target is missing value then error "not found: " & inPath
      save as target file name outPath file format format PDF
      close target saving no
    end timeout
  end tell
end run
