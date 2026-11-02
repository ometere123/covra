# v0.3.0
# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }

import genlayer as gl
from genlayer.types import *


class BradburyPositiveControl(gl.contract.Contract):
    counter: u256

    def __init__(self) -> None:
        self.counter = u256(0)

    @gl.public.view
    def get_counter(self) -> u256:
        return self.counter

    @gl.public.write
    def increment(self, amount: u256) -> None:
        self.counter = self.counter + amount
