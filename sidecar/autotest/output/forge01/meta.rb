# frozen_string_literal: true

require_relative '../meta'

module Engine
  module Game
    module GForge01
      module Meta
        include ::Engine::Game::Meta

        DEV_STAGE = :alpha

        GAME_TITLE = 'Forge01'

        PLAYER_RANGE = [2, 6].freeze
      end
    end
  end
end
