module Ledger
  module Admin
    module Roles
      ALL = %w[viewer accountant auditor owner].freeze
      EXPORT = %w[accountant auditor owner].freeze

      module_function

      def can_export?(role)
        EXPORT.include?(role)
      end
    end
  end
end
