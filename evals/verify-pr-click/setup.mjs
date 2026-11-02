import { realPr } from '../real-pr.mjs';

realPr(process.argv.slice(2), {
  url: 'https://github.com/pallets/click.git',
  base: '380008389b32ca2b7de7c73f670a9eee1562004e',
  head: '1787497713fa389435ed732c9b26274c3cdc458d',
  pr: {
    "number": 2788,
    "title": "Added functionality to set flag_value correctly when using envvar",
    "body": "```python\r\n@click.option('--upper', flag_value='upper', envvar='UPPER')\r\ndef cmd(upper):\r\n    click.echo(upper)\r\n    return upper\r\n```\r\n\r\n### Default use\r\nThe expectation of the above code when running `python cmd.py --upper` is to print to stdout `upper` (the flag value). This is default behaviour and works correctly.\r\n\r\n### Environment variable use\r\nWhat is the expectation when we run `UPPER=32 python cmd.py` ?\r\n\r\nThe program should still print to the screen `upper`, because that is the `flag_value` and there exists an env variable defined with the name `UPPER`, yet it actually prints `32`, the value of the environment variable, which i don't believe is intended.\r\n\r\n*I also added a test for this functionality called `test_envvar_flag_value`*\r\nfixes #2746 \r\n",
    "headRefName": "flag_value_envvar_fix",
    "author": {
      "login": "chips-wq"
    },
    "url": "https://github.com/pallets/click/pull/2788"
  },
});
