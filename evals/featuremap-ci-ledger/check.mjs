import fs from 'node:fs';
import { check, report, pullRequests, productChanges } from '../lib.mjs';

const changed = productChanges(['gems/', 'jobs/', 'engine/', 'native/'],
  { allow: ['README.md', 'Makefile', '.gitignore', '.github/', '**/Cargo.lock'] });
check('changes no product file', !changed.length, changed.join(', '));

const pr = pullRequests();
const probe = (name, expect, plant) => {
  try {
    const result = plant();
    check(name, expect === 'pass' ? result.pass : result.caught, result.detail);
  } catch (error) { check(name, false, error.message); }
};
const caught = (name, plant) => probe(name, 'caught', () => { pr.branch(name.replace(/\W+/g, '-')); plant(); pr.commit(name); return pr.ci(); });
const cmake = (target, file) => text => text.replace(new RegExp(`(add_(?:library|executable)\\(${target} [^)]*)\\)`), `$1 ${file})`);
const original = file => fs.readFileSync(new URL(`files/${file}`, import.meta.url), 'utf8');

try {
  probe('CI passes on main', 'pass', () => {
    const push = pr.branch('main').ci({ event: 'push', base: process.env.EVAL_HEAD });
    const same = pr.branch('no-change').ci();
    return { pass: push.pass && same.pass, detail: `${push.detail} || ${same.detail}` };
  });

  probe('CI passes on a clean pull request', 'pass', () => {
    pr.branch('clean')
      .write('gems/api/lib/ledger/api/refunds.rb', 'require "ledger/core/money"\nrequire_relative "pagination"\n\nmodule Ledger\n  module Api\n    module Refunds\n      module_function\n\n      def index(refunds, cursor: 0)\n        Pagination.page(refunds.map { |r| { "id" => r[:id], "amount" => r[:money].to_s } }, cursor: cursor)\n      end\n    end\n  end\nend\n')
      .write('gems/admin/lib/ledger/admin/sync.rb', 'require "ledger/core/account"\nrequire "ledger/admin/api_client"\n\nmodule Ledger\n  module Admin\n    module Sync\n      module_function\n\n      def accounts(client)\n        client.accounts["items"].map { |row| Core::Account.new(id: row["id"], kind: row["kind"].to_sym, currency: row["balance"]["currency"]) }\n      end\n    end\n  end\nend\n')
      .write('jobs/ledger_jobs/reconcile/late.py', 'from ledger_jobs.common.reconcile_window import SETTLEMENT_DAYS\n\nfrom ..common import money\nfrom . import rules\n\n\ndef late(entry, line):\n    return (line["date"] - entry["posted_on"]).days > SETTLEMENT_DAYS and rules.same_amount(entry["cents"], money.to_cents(line["amount"]))\n')
      .write('jobs/ledger_jobs/statements/totals.py', 'from ..common.money import format_cents\nfrom .layout import row\n\n\ndef total(entries, currency):\n    return row("Total", format_cents(sum(e["cents"] for e in entries), currency))\n')
      .edit('engine/posting/Cargo.toml', text => `${text}fx.workspace = true\n`)
      .edit('engine/posting/src/lib.rs', text => `${text}\npub fn post_converted(lines: Vec<Line>, rate: &fx::Rate) -> Result<Vec<Line>, Error> {\n    let converted = lines\n        .into_iter()\n        .map(|l| fx::convert(l.amount, rate).map(|amount| Line { amount, ..l }))\n        .collect::<Option<Vec<_>>>()\n        .ok_or(Error::Empty)?;\n    post(converted)\n}\n`)
      .write('native/ffi/src/minor.c', '#include "ledger_ffi.h"\n\n#include <fixed/fixed.h>\n#include <iso/currency.h>\n\nlong long ledger_minor_units(const char *code) {\n  const iso_currency_t *c = iso_currency(code);\n  return c ? fixed_rescale(fixed_make(1, 0), c->minor_units).units : -1;\n}\n')
      .edit('native/CMakeLists.txt', cmake('ledger_ffi', 'ffi/src/minor.c'));
    pr.commit('feat: refunds, admin sync, late payments, totals, converted posts and minor units');
    return pr.ci();
  });

  caught('CI fails on a new Ruby require across gems', () => pr.write('gems/core/lib/ledger/core/audit.rb',
    'require "ledger/admin/roles"\n\nmodule Ledger\n  module Core\n    module Audit\n      module_function\n\n      def reader?(role)\n        Admin::Roles::ALL.include?(role)\n      end\n    end\n  end\nend\n'));

  caught('CI fails on a new Python relative import across parts', () => pr.write('jobs/ledger_jobs/reconcile/report.py',
    'from ..statements.layout import row\n\n\ndef summary(pairs):\n    return row("Matched", str(len(pairs)))\n'));

  caught('CI fails on a new crate dependency', () => pr
    .edit('engine/fx/Cargo.toml', text => `${text}posting.workspace = true\n`)
    .edit('engine/fx/src/lib.rs', text => `${text}\npub fn post_converted(lines: Vec<journal::posting::Line>) -> Result<Vec<journal::posting::Line>, posting::Error> {\n    posting::post(lines)\n}\n`));

  caught('CI fails on a new C include and link between libraries', () => pr
    .write('native/fixed/src/currency.c', '#include <fixed/fixed.h>\n#include <iso/currency.h>\n\nfixed_t fixed_for_currency(fixed_t value, const char *code) {\n  const iso_currency_t *c = iso_currency(code);\n  return c ? fixed_rescale(value, c->minor_units) : value;\n}\n')
    .edit('native/CMakeLists.txt', text => cmake('fixed', 'fixed/src/currency.c')(text)
      .replace('target_include_directories(fixed PUBLIC fixed/include)\n', 'target_include_directories(fixed PUBLIC fixed/include)\ntarget_link_libraries(fixed PRIVATE iso)\n')));

  caught('CI fails on a second Python import from a file that already has a break', () => pr
    .edit('jobs/ledger_jobs/statements/render.py', text => text.replace('from ledger_jobs.reconcile.matching import unmatched\n', 'from ledger_jobs.reconcile.matching import unmatched\nfrom ledger_jobs.reconcile.rules import TOLERANCE_CENTS\n')
      .replace('    return "\\n".join(lines)', '    lines.append(layout.row("Tolerance", format_cents(TOLERANCE_CENTS, account["currency"])))\n    return "\\n".join(lines)')));

  caught('CI fails when a break moves to another gem', () => pr
    .edit('gems/admin/lib/ledger/admin/exports.rb', text => text.replace('require "ledger/api/serializers"\n', '')
      .replace('accounts.map { |a| Api::Serializers.account(a, balances.fetch(a.id, a.zero)) }',
        'accounts.map do |a|\n          balance = balances.fetch(a.id, a.zero)\n          { "id" => a.id, "kind" => a.kind.to_s, "balance" => { "amount" => balance.cents, "currency" => balance.currency } }\n        end'))
    .edit('gems/api/lib/ledger/api/accounts.rb', text => text.replace('require_relative "pagination"\n', 'require_relative "pagination"\nrequire "ledger/admin/roles"\n')
      .replace('      def index(', '      def export_allowed?(role)\n        Admin::Roles.can_export?(role)\n      end\n\n      def index(')));

  probe('CI fails when a pull request runs make known-breaks to allow a new break', 'caught', () => {
    pr.branch('grow').write('jobs/ledger_jobs/common/periods.py', 'from ledger_jobs.statements.layout import PAGE_WIDTH\n\n\ndef heading(month):\n    return month.center(PAGE_WIDTH)\n');
    pr.make('known-breaks');
    pr.commit('feat: period headings');
    pr.edit('jobs/ledger_jobs/common/money.py', text => `${text}\n\nZERO = 0\n`).commit('feat: zero');
    return pr.ci();
  });

  let shrunk = null;
  probe('CI passes after a break is removed and make known-breaks runs', 'pass', () => {
    pr.branch('shrink')
      .write('engine/fx/Cargo.toml', original('engine/fx/Cargo.toml').replace('\n[dependencies]\njournal.workspace = true\n', ''))
      .write('engine/fx/src/lib.rs', 'pub struct Rate {\n    pub from: [u8; 3],\n    pub to: [u8; 3],\n    pub micros: i64,\n}\n\npub fn convert(cents: i64, currency: [u8; 3], rate: &Rate) -> Option<i64> {\n    if currency != rate.from {\n        return None;\n    }\n    Some(cents * rate.micros / 1_000_000)\n}\n')
      .edit('engine/server/src/main.rs', text => text.replace('let eur = fx::convert(usd, &rate).expect("rate matches");',
        'let eur = Amount { cents: fx::convert(usd.cents, usd.currency, &rate).expect("rate matches"), currency: rate.to };'));
    const made = pr.make('known-breaks');
    if (made.code !== 0) throw new Error(`make known-breaks exit ${made.code}: ${made.output}`);
    shrunk = pr.commit('refactor: fx converts plain cents');
    return pr.ci();
  });

  probe('CI fails when a removed break comes back', 'caught', () => {
    if (!shrunk) throw new Error('the shrink probe made no commit');
    pr.branch('restore', shrunk);
    for (const file of ['engine/fx/Cargo.toml', 'engine/fx/src/lib.rs', 'engine/server/src/main.rs']) pr.write(file, original(file));
    pr.commit('fix: fx works on journal amounts again');
    return pr.ci({ base: shrunk });
  });
} finally {
  pr.cleanup();
}
report();
