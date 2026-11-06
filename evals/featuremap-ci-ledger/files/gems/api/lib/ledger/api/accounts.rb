require "ledger/core/account"
require_relative "serializers"
require_relative "pagination"

module Ledger
  module Api
    module Accounts
      module_function

      def index(accounts, balances, cursor: 0)
        rows = accounts.map { |a| Serializers.account(a, balances.fetch(a.id, a.zero)) }
        Pagination.page(rows, cursor: cursor)
      end
    end
  end
end
