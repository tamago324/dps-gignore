function! denops#gignore#complete(arg, line, pos) abort
  return sort(filter(denops#request('gignore', 'getLanguages', []), 'stridx(v:val, a:arg) == 0'))
endfunction

