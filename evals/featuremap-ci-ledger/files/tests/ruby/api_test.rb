require "minitest/autorun"
require "ledger/api"

class ApiTest < Minitest::Test
  def test_index_pages_accounts
    accounts = (1..3).map { |i| Ledger::Core::Account.new(id: i, kind: :asset, currency: "USD") }
    page = Ledger::Api::Accounts.index(accounts, { 2 => Ledger::Core::Money.new(500, "USD") })
    assert_equal 500, page["items"][1]["balance"]["amount"]
    assert_nil page["next"]
  end
end
