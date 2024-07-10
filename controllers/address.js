const ObjectId = require("mongoose").Types.ObjectId;
const Country = require("../models/country");
const Addiv1 = require("../models/addiv1");
const Addiv2 = require("../models/addiv2");
const Addiv3 = require("../models/addiv3");
const MyCountry = require("../models/myCountry");
const MyAddiv1 = require("../models/myAddiv1");
const MyAddiv2 = require("../models/myAddiv2");
const MyAddiv3 = require("../models/myAddiv3");
// const MyCountry = require("../models/address/myCountry");

exports.listCountry = async (req, res) => {
  const countries = await Country.find({}).exec();
  res.json(countries);
};

exports.listAddiv1 = async (req, res) => {
  const couid = new ObjectId(req.params.couid);
  const addiv1 = await Addiv1.find({ couid }).sort({ name: 1 }).exec();
  res.json(addiv1);
};

exports.listAddiv2 = async (req, res) => {
  const couid = new ObjectId(req.params.couid);
  const addiv1 = new ObjectId(req.params.addiv1);
  const addiv2 = await Addiv2.find({ couid, adDivId1: addiv1 })
    .sort({ name: 1 })
    .exec();
  res.json(addiv2);
};

exports.listAddiv3 = async (req, res) => {
  const couid = new ObjectId(req.params.couid);
  const addiv1 = new ObjectId(req.params.addiv1);
  const addiv2 = new ObjectId(req.params.addiv2);
  const addiv3 = await Addiv3.find({
    couid,
    adDivId1: addiv1,
    adDivId2: addiv2,
  })
    .sort({ name: 1 })
    .exec();
  res.json(addiv3);
};

exports.copyAllAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, details } = req.body;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  const addiv1 = await Addiv1.find({}).exec();
  addiv1
    .map((data) => ({
      ...data._doc,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv1.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
        });
      } catch (error) {}
    });

  const addiv2 = await Addiv2.find({}).exec();
  addiv2
    .map((data) => ({
      ...data._doc,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv2.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
          adDivId1: new ObjectId(data.adDivId1),
        });
      } catch (error) {}
    });

  const addiv3 = await Addiv3.find({}).exec();
  addiv3
    .map((data) => ({
      ...data._doc,
      ...details,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv3.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
          adDivId1: new ObjectId(data.adDivId1),
          adDivId2: new ObjectId(data.adDivId2),
        });
      } catch (error) {}
    });

  res.json({ ok: true });
};

exports.saveCreatedLocation1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1, addiv2, addiv3 } = values;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
    });
  } catch (error) {}

  MyAddiv1.collection
    .insertOne({
      name: addiv1.name,
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    })
    .then((result1) => {
      MyAddiv2.collection
        .insertOne({
          name: addiv2.name,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(country._id),
          adDivId1: new ObjectId(result1.ops[0]._id),
        })
        .then((result2) => {
          MyAddiv3.collection.insertOne({
            name: addiv3.name,
            estoreid: new ObjectId(estoreid),
            couid: new ObjectId(country._id),
            adDivId1: new ObjectId(result1.ops[0]._id),
            adDivId2: new ObjectId(result2.ops[0]._id),
            ...details,
          });
        });
    });

  res.json({ ok: true });
};

exports.copyAllAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, addiv1, details } = req.body;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  try {
    await MyAddiv1.collection.insertOne({
      ...addiv1,
      _id: new ObjectId(addiv1._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    });
  } catch (error) {}

  const addiv2 = await Addiv2.find({
    couid: new ObjectId(country._id),
    adDivId1: new ObjectId(addiv1._id),
  }).exec();
  addiv2
    .map((data) => ({
      ...data._doc,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv2.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
          adDivId1: new ObjectId(data.adDivId1),
        });
      } catch (error) {}
    });

  const addiv3 = await Addiv3.find({
    couid: new ObjectId(country._id),
    adDivId1: new ObjectId(addiv1._id),
  }).exec();
  addiv3
    .map((data) => ({
      ...data._doc,
      ...details,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv3.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
          adDivId1: new ObjectId(data.adDivId1),
          adDivId2: new ObjectId(data.adDivId2),
        });
      } catch (error) {}
    });

  res.json({ ok: true });
};

exports.saveCreatedLocation2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1, addiv2, addiv3 } = values;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  try {
    await MyAddiv1.collection.insertOne({
      ...addiv1,
      _id: new ObjectId(addiv1._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    });
  } catch (error) {}

  MyAddiv2.collection
    .insertOne({
      name: addiv2.name,
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
      adDivId1: new ObjectId(addiv1._id),
    })
    .then((result2) => {
      MyAddiv3.collection.insertOne({
        name: addiv3.name,
        estoreid: new ObjectId(estoreid),
        couid: new ObjectId(country._id),
        adDivId1: new ObjectId(addiv1._id),
        adDivId2: new ObjectId(result2.ops[0]._id),
        ...details,
      });
    });

  res.json({ ok: true });
};

exports.copyAllAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, addiv1, addiv2, details } = req.body;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  try {
    await MyAddiv1.collection.insertOne({
      ...addiv1,
      _id: new ObjectId(addiv1._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    });
  } catch (error) {}

  try {
    await MyAddiv2.collection.insertOne({
      ...addiv2,
      _id: new ObjectId(addiv2._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
      adDivId1: new ObjectId(addiv1._id),
    });
  } catch (error) {}

  const addiv3 = await Addiv3.find({
    couid: new ObjectId(country._id),
    adDivId1: new ObjectId(addiv1._id),
    adDivId2: new ObjectId(addiv2._id),
  }).exec();
  addiv3
    .map((data) => ({
      ...data._doc,
      ...details,
    }))
    .forEach(async (data) => {
      try {
        await MyAddiv3.collection.insertOne({
          ...data,
          estoreid: new ObjectId(estoreid),
          couid: new ObjectId(data.couid),
          adDivId1: new ObjectId(data.adDivId1),
          adDivId2: new ObjectId(data.adDivId2),
        });
      } catch (error) {}
    });

  res.json({ ok: true });
};

exports.saveCreatedLocation3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { values, details } = req.body;
  const { country, addiv1, addiv2, addiv3 } = values;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  try {
    await MyAddiv1.collection.insertOne({
      ...addiv1,
      _id: new ObjectId(addiv1._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    });
  } catch (error) {}

  try {
    await MyAddiv2.collection.insertOne({
      ...addiv2,
      _id: new ObjectId(addiv2._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
      adDivId1: new ObjectId(addiv1._id),
    });
  } catch (error) {}

  MyAddiv3.collection.insertOne({
    name: addiv3.name,
    estoreid: new ObjectId(estoreid),
    couid: new ObjectId(country._id),
    adDivId1: new ObjectId(addiv1._id),
    adDivId2: new ObjectId(addiv2._id),
    ...details,
  });

  res.json({ ok: true });
};

exports.saveLocation3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { country, addiv1, addiv2, addiv3, details } = req.body;

  try {
    await MyCountry.collection.insertOne({
      ...country,
      _id: new ObjectId(country._id),
      estoreid: new ObjectId(estoreid),
    });
  } catch (error) {}

  try {
    await MyAddiv1.collection.insertOne({
      ...addiv1,
      _id: new ObjectId(addiv1._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
    });
  } catch (error) {}

  try {
    await MyAddiv2.collection.insertOne({
      ...addiv2,
      _id: new ObjectId(addiv2._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
      adDivId1: new ObjectId(addiv1._id),
    });
  } catch (error) {}

  try {
    await MyAddiv3.collection.insertOne({
      ...addiv3,
      _id: new ObjectId(addiv3._id),
      estoreid: new ObjectId(estoreid),
      couid: new ObjectId(country._id),
      adDivId1: new ObjectId(addiv1._id),
      adDivId2: new ObjectId(addiv2._id),
      ...details,
    });
  } catch (error) {}

  res.json({ ok: true });
};

exports.listMyCountry = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const countries = await MyCountry.find({
    estoreid: new ObjectId(estoreid),
  }).exec();
  res.json(countries);
};

exports.listNewAdded = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv2 = await MyAddiv2.find({ estoreid: new ObjectId(estoreid) })
    .limit(10)
    .exec();
  const addiv3 = await MyAddiv3.find({
    adDivId2: { $in: addiv2.map((addiv) => addiv._id) },
    estoreid: new ObjectId(estoreid),
  })
    .sort({ createAt: -1 })
    .exec();
  res.json(addiv3);
};

exports.listMyAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = req.params.couid;
  const addiv1 = await MyAddiv1.find({
    couid: new ObjectId(couid),
    estoreid: new ObjectId(estoreid),
  })
    .sort({ name: 1 })
    .exec();
  res.json(addiv1);
};

exports.listMyAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = new ObjectId(req.params.couid);
  let addiv2 = [];

  if (req.params.addiv1 === "all") {
    addiv2 = await MyAddiv2.find({
      couid: new ObjectId(couid),
      estoreid: new ObjectId(estoreid),
    })
      .sort({ name: 1 })
      .exec();
  } else {
    const addiv1 = new ObjectId(req.params.addiv1);
    addiv2 = await MyAddiv2.find({
      couid: new ObjectId(couid),
      estoreid: new ObjectId(estoreid),
      adDivId1: addiv1,
    })
      .sort({ name: 1 })
      .exec();
  }
  res.json(addiv2);
};

exports.listMyAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = new ObjectId(req.params.couid);
  const addiv1 = new ObjectId(req.params.addiv1);
  let addiv3 = [];

  if (req.params.addiv2 === "all") {
    addiv3 = await MyAddiv3.find({
      couid: new ObjectId(couid),
      estoreid: new ObjectId(estoreid),
      adDivId1: addiv1,
    })
      .sort({ name: 1 })
      .exec();
  } else {
    const addiv2 = new ObjectId(req.params.addiv2);
    addiv3 = await MyAddiv3.find({
      couid: new ObjectId(couid),
      estoreid: new ObjectId(estoreid),
      adDivId1: addiv1,
      adDivId2: addiv2,
    })
      .sort({ name: 1 })
      .exec();
  }
  res.json(addiv3);
};

exports.getAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const addiv3 = await MyAddiv3.findOne({
      _id: req.params.addiv3,
      estoreid: new ObjectId(estoreid),
    }).exec();
    res.json(addiv3);
  } catch (error) {
    res.status(400).send("Location search failed.");
  }
};

exports.updateMyAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const couid = req.body.couid;
  try {
    const updated = await MyAddiv3.findOneAndUpdate(
      { _id: req.params.addiv3, estoreid: new ObjectId(estoreid) },
      { ...req.body, couid: new ObjectId(couid) },
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).send("Updating location failed.");
  }
};

exports.deleteAddiv3 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv3 = req.query.addiv3;
  try {
    await MyAddiv3.findOneAndRemove({
      _id: addiv3,
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};

exports.deleteAddiv2 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv2 = req.query.addiv2;
  try {
    await MyAddiv2.findOneAndRemove({
      _id: new ObjectId(addiv2),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv3.deleteMany({
      adDivId2: new ObjectId(addiv2),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};

exports.deleteAddiv1 = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const addiv1 = req.query.addiv1;
  try {
    await MyAddiv1.findOneAndRemove({
      _id: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv2.deleteMany({
      adDivId1: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    await MyAddiv3.deleteMany({
      adDivId1: new ObjectId(addiv1),
      estoreid: new ObjectId(estoreid),
    }).exec();

    res.json({ ok: true });
  } catch (error) {
    res.status(400).send("Location delete failed.");
  }
};
