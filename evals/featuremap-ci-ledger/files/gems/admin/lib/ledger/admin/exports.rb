require "ledger/core/account"
require "ledger/api/serializers"
require_relative "roles"

module Ledger
  module Admin
    module Exports
      module_function

      def balances(role, accounts, balances)
        raise ArgumentError, "#{role} may not export" unless Roles.can_export?(role)

        accounts.map { |a| Api::Serializers.account(a, balances.fetch(a.id, a.zero)) }
      end
    end
  end
end
