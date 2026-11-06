require "minitest/autorun"
require "ledger/admin"

class AdminTest < Minitest::Test
  def test_export_needs_a_role
    account = Ledger::Core::Account.new(id: 7, kind: :liability, currency: "EUR")
    assert_raises(ArgumentError) { Ledger::Admin::Exports.balances("viewer", [account], {}) }
    rows = Ledger::Admin::Exports.balances("auditor", [account], {})
    assert_equal "liability", rows.first["kind"]
  end
end
