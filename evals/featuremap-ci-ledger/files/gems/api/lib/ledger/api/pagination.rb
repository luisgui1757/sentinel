module Ledger
  module Api
    module Pagination
      DEFAULT_LIMIT = 50

      module_function

      def page(items, cursor: 0, limit: DEFAULT_LIMIT)
        slice = items.drop(cursor).first(limit)
        following = cursor + slice.size
        { "items" => slice, "next" => following < items.size ? following : nil }
      end
    end
  end
end
